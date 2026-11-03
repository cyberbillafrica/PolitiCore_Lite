"use client";

/*
 * ============================================================
 * REGISTRATION REVIEW (Round 17)
 * ============================================================
 *
 * Public signups are created with `status: "pending"` and no campaign
 * grants. They cannot be used until an admin approves them from
 * /portal/admin/registrations, which:
 *
 *   1. applies the admin's field corrections,
 *   2. flips `status` to "active",
 *   3. writes the 9 baseline `user_access` documents
 *
 * Steps 2 and 3 happen in ONE Firestore batch (see `approveRegistration`
 * in ./userAccess), so a member is never active without their grants and
 * never granted while still pending.
 *
 * Rejection is a SOFT delete: the profile document stays with
 * `status: "rejected"` and the optional reason, so the decision is
 * auditable and can be reversed.
 */

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "./config";
import { getAllEnuguLGAs } from "./electoral";
import { notifyUsers } from "./notifications";

import {
  registrationAdminRecipients,
  REGISTRATION_ADMIN_CAP,
} from "@/lib/notifications";

import type { UserProfile } from "@/types";

export interface RegistrationRecord extends UserProfile {
  id: string;
}

const USERS = "users";

/* ============================================================
 * READ — REVIEW QUEUE
 * ============================================================ */

function toRecord(id: string, data: Record<string, unknown>): RegistrationRecord {
  return { id, ...(data as Omit<UserProfile, never>) } as RegistrationRecord;
}

function createdAtMillis(value: unknown): number {
  if (!value) return 0;

  if (typeof value === "object" && value !== null && "toMillis" in value) {
    const millis = (value as { toMillis?: () => number }).toMillis;
    if (typeof millis === "function") return millis.call(value);
  }

  if (value instanceof Date) return value.getTime();

  return 0;
}

/**
 * Live queue of registrations in one status, newest first.
 *
 * The query is equality-only (`status == …`) so it stays on the automatic
 * single-field index; ordering happens in memory. Rejected rows are
 * browsable so an admin can reverse a decision.
 */
export function subscribeRegistrations(
  status: "pending" | "rejected",
  onChange: (rows: RegistrationRecord[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, USERS), where("status", "==", status)),
    (snapshot) => {
      const rows = snapshot.docs
        .map((item) => toRecord(item.id, item.data()))
        .sort((a, b) => createdAtMillis(b.created_at) - createdAtMillis(a.created_at));

      onChange(rows);
    },
    (error) => {
      console.error("Failed to watch registrations:", error);
    },
  );
}

/** Live count of pending registrations (nav badge / dashboard card). */
export function subscribePendingRegistrationCount(
  onChange: (count: number) => void,
): () => void {
  return onSnapshot(
    query(collection(db, USERS), where("status", "==", "pending")),
    (snapshot) => onChange(snapshot.size),
    (error) => {
      console.error("Failed to count pending registrations:", error);
    },
  );
}

/* ============================================================
 * NOTIFY — ADMINS ON SIGNUP
 * ============================================================ */

/**
 * Resolve a ward id to its display name, falling back to the id.
 *
 * `electoral_data` is a public read, so this costs no authority; the
 * fallback keeps signup working before the hierarchy is seeded.
 */
async function wardDisplayName(wardId: string | undefined): Promise<string> {
  const id = (wardId ?? "").trim();
  if (!id) return "";

  try {
    const lgas = await getAllEnuguLGAs();

    for (const lga of lgas) {
      const ward = lga.wards.find((item) => item.id === id);
      if (ward) return ward.name;
    }
  } catch {
    /* Fall through to the raw id. */
  }

  return id;
}

/**
 * Tell the administrators that somebody registered.
 *
 * Only ACTIVE admins are addressed (see `registrationAdminRecipients`),
 * capped at 20. The signup already succeeded, so every failure here is
 * swallowed: a notification is a courtesy, never a transaction.
 */
export async function notifyAdminsOfRegistration(input: {
  userId: string;
  fullName: string;
  wardId?: string;
}): Promise<number> {
  try {
    const snapshot = await getDocs(
      query(collection(db, USERS), where("access_role", "==", "admin")),
    );

    const recipients = registrationAdminRecipients(
      snapshot.docs.map((item) => ({
        id: item.id,
        status: (item.data().status as string | null | undefined) ?? null,
      })),
      input.userId,
      REGISTRATION_ADMIN_CAP,
    );

    if (recipients.length === 0) return 0;

    const ward = await wardDisplayName(input.wardId);
    const name = input.fullName.trim() || "A new volunteer";

    return await notifyUsers({
      user_ids: recipients,
      actor_id: input.userId,
      type: "registration_pending",
      title: `New registration: ${name}`,
      message: ward ? `${name} registered from ${ward}.` : `${name} registered.`,
      link: "/portal/admin/registrations",
      entity_type: "user",
      entity_id: input.userId,
    });
  } catch (error) {
    console.warn("Failed to notify admins about a registration:", error);
    return 0;
  }
}

/* ============================================================
 * WRITE — REJECT
 * ============================================================ */

export async function rejectRegistration(
  userId: string,
  reason: string | null,
  actorId: string,
): Promise<void> {
  await updateDoc(doc(db, USERS, userId), {
    status: "rejected",
    rejected_at: serverTimestamp(),
    rejected_by: actorId,
    rejection_reason: reason?.trim() || null,
    updated_at: serverTimestamp(),
  });

  await notifyUsers({
    user_ids: [userId],
    actor_id: actorId,
    type: "registration_rejected",
    title: "Registration declined",
    message:
      reason?.trim() ||
      "Your registration was declined. Please contact the campaign team.",
    link: "/login",
    entity_type: "user",
    entity_id: userId,
  }).catch(() => 0);
}

/**
 * Move a declined registration back into the review queue.
 *
 * Re-approval is deliberately TWO steps: reopening clears the rejection
 * and returns the profile to `pending`, so the admin reviews the current
 * data (and can correct it) before any grant is written.
 */
export async function reopenRegistration(userId: string): Promise<void> {
  await updateDoc(doc(db, USERS, userId), {
    status: "pending",
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
    updated_at: serverTimestamp(),
  });
}

/* ============================================================
 * WRITE — NOTIFY THE APPLICANT OF A DECISION
 * ============================================================ */

export async function notifyRegistrationApproved(input: {
  userId: string;
  fullName: string;
  actorId: string;
}): Promise<void> {
  await notifyUsers({
    user_ids: [input.userId],
    actor_id: input.actorId,
    type: "registration_approved",
    title: "Registration approved",
    message: `${input.fullName.trim() || "Your account"} is approved — you can sign in now.`,
    link: "/login",
    entity_type: "user",
    entity_id: input.userId,
  }).catch(() => 0);
}
