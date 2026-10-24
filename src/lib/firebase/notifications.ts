"use client";

/*
 * ============================================================
 * NOTIFICATIONS — PER-USER INBOX
 * ============================================================
 *
 * One document per (event, recipient):
 *
 *   notifications/{autoId}
 *   {
 *     user_id, actor_id, type, title, message, link,
 *     entity_type, entity_id, read, created_at, read_at
 *   }
 *
 * `read` lives on the document, unlike announcements (whose read state
 * is device-local). The bell subscribes to the caller's own rows with
 * one `user_id == uid` query, ordered newest first.
 *
 * Writes are FAN-OUT: the actor's session writes one row per targeted
 * member (never for the actor), capped at 100 recipients per event.
 * A fan-out failure must never fail the workflow that triggered it, so
 * the callers in the data layer catch and log.
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "./config";

import { capRecipients } from "@/lib/notifications";
import { formatOrganizationalPosition } from "@/lib/organization";

import type { AppNotification, NotificationType, OrganizationalPosition } from "@/types";

const COLLECTION = "notifications";
const BELL_LIMIT = 100;

/* ============================================================
 * MAPPING
 * ============================================================ */

function mapNotification(
  id: string,
  data: Record<string, unknown>,
): AppNotification {
  return {
    id,
    user_id: String(data.user_id ?? ""),
    actor_id: String(data.actor_id ?? ""),
    type: String(data.type ?? "assignment_created") as NotificationType,
    title: String(data.title ?? ""),
    message: String(data.message ?? ""),
    link: String(data.link ?? ""),
    entity_type: String(data.entity_type ?? ""),
    entity_id: String(data.entity_id ?? ""),
    read: data.read === true,
    created_at: data.created_at,
    read_at: data.read_at,
  };
}

/* ============================================================
 * WRITE — GENERIC FAN-OUT
 * ============================================================ */

export interface FanOutInput {
  user_ids: Array<string | null | undefined>;

  actor_id: string;
  type: NotificationType;

  title: string;
  message: string;

  link?: string;
  entity_type?: string;
  entity_id?: string;
}

/**
 * Write one notification per recipient, in a single batch.
 *
 * Returns the number written. Recipients are de-duplicated, the actor is
 * excluded, and the list is capped by `capRecipients()`.
 */
export async function notifyUsers(input: FanOutInput): Promise<number> {
  const recipients = capRecipients(input.user_ids, input.actor_id);
  if (recipients.length === 0) return 0;

  const batch = writeBatch(db);

  for (const userId of recipients) {
    batch.set(doc(collection(db, COLLECTION)), {
      user_id: userId,
      actor_id: input.actor_id,
      type: input.type,
      title: input.title.slice(0, 200),
      message: input.message.slice(0, 500),
      link: input.link ?? "",
      entity_type: input.entity_type ?? "",
      entity_id: input.entity_id ?? "",
      read: false,
      created_at: serverTimestamp(),
    });
  }

  await batch.commit();

  return recipients.length;
}

/* ============================================================
 * WRITE — THE NINE EVENTS
 * ============================================================ */

export function notifyAssignmentCreated(input: {
  assignmentId: string;
  title: string;
  recipientIds: string[];
  actorId: string;
}): Promise<number> {
  return notifyUsers({
    user_ids: input.recipientIds,
    actor_id: input.actorId,
    type: "assignment_created",
    title: `New assignment: ${input.title}`,
    message: "Campaign work has been assigned to you.",
    link: "/portal/campaign/assignments",
    entity_type: "campaign_assignment",
    entity_id: input.assignmentId,
  });
}

export function notifyAssignmentCompleted(input: {
  assignmentId: string;
  reportId: string;
  reportTitle: string;
  creatorId: string;
  actorId: string;
}): Promise<number> {
  return notifyUsers({
    user_ids: [input.creatorId],
    actor_id: input.actorId,
    type: "assignment_completed",
    title: `Report submitted: ${input.reportTitle}`,
    message: "A targeted member submitted a completion report for your assignment.",
    link: "/portal/campaign/reports",
    entity_type: "campaign_field_report",
    entity_id: input.reportId,
  });
}

export function notifyAssignmentReviewed(input: {
  assignmentId: string;
  title: string;
  memberId: string;
  status: "approved" | "rejected";
  actorId: string;
  notes?: string | null;
}): Promise<number> {
  return notifyUsers({
    user_ids: [input.memberId],
    actor_id: input.actorId,
    type:
      input.status === "approved"
        ? "assignment_approved"
        : "assignment_rejected",
    title: `Assignment ${input.status}: ${input.title}`,
    message:
      (input.notes?.trim() ||
        (input.status === "approved"
          ? "Your completion was approved."
          : "Your completion was rejected — you can resubmit.")),
    link: "/portal/campaign/assignments",
    entity_type: "campaign_assignment",
    entity_id: input.assignmentId,
  });
}

export function notifyReportReviewed(input: {
  reportId: string;
  reportTitle: string;
  submitterId: string;
  status: "approved" | "rejected";
  actorId: string;
  notes?: string | null;
}): Promise<number> {
  return notifyUsers({
    user_ids: [input.submitterId],
    actor_id: input.actorId,
    type: "report_reviewed",
    title: `Report ${input.status}: ${input.reportTitle}`,
    message:
      input.notes?.trim() ||
      (input.status === "approved"
        ? "Your report was approved."
        : "Your report was rejected — review the notes and resubmit."),
    link: "/portal/campaign/reports",
    entity_type: "campaign_field_report",
    entity_id: input.reportId,
  });
}

/**
 * A new issue goes to the administrators' inbox.
 *
 * The coordinator audience cannot be resolved from the raiser's session:
 * `organizational_assignments` reads require `view_members` at the
 * DOCUMENT's scope, which a plain member only holds at their own polling
 * unit. Admins can read the collection, so they are the reliable
 * audience; coordinators still see the issue itself on the Issues page.
 */
export async function notifyIssueRaised(input: {
  issueId: string;
  title: string;
  actorId: string;
}): Promise<number> {
  const snapshot = await getDocs(
    query(collection(db, "users"), where("access_role", "==", "admin")),
  );

  return notifyUsers({
    user_ids: snapshot.docs.map((item) => item.id),
    actor_id: input.actorId,
    type: "issue_raised",
    title: `New issue: ${input.title}`,
    message: "A new campaign issue was raised and is awaiting review.",
    link: "/portal/campaign/issues",
    entity_type: "issue",
    entity_id: input.issueId,
  });
}

export function notifyIssueStatusChanged(input: {
  issueId: string;
  title: string;
  raisedBy: string;
  status: string;
  actorId: string;
}): Promise<number> {
  return notifyUsers({
    user_ids: [input.raisedBy],
    actor_id: input.actorId,
    type: "issue_status_changed",
    title: `Issue ${input.status}: ${input.title}`,
    message:
      input.status === "resolved"
        ? "The issue you raised was resolved."
        : "The issue you raised was acknowledged.",
    link: "/portal/campaign/issues",
    entity_type: "issue",
    entity_id: input.issueId,
  });
}

export function notifyActivityCreated(input: {
  activityId: string;
  title: string;
  recipientIds: string[];
  actorId: string;
  when?: string;
  venue?: string;
}): Promise<number> {
  const detail = [input.when, input.venue].filter(Boolean).join(" · ");

  return notifyUsers({
    user_ids: input.recipientIds,
    actor_id: input.actorId,
    type: "activity_created",
    title: `New activity: ${input.title}`,
    message: detail || "A new campaign activity has been scheduled in your area.",
    link: "/portal/campaign/activities",
    entity_type: "campaign_activity",
    entity_id: input.activityId,
  });
}

export function notifyRoleAssigned(input: {
  memberId: string;
  position: OrganizationalPosition;
  actorId: string;
  scopeLabel?: string;
}): Promise<number> {
  const position = formatOrganizationalPosition(input.position);

  return notifyUsers({
    user_ids: [input.memberId],
    actor_id: input.actorId,
    type: "role_assigned",
    title: `New role: ${position}`,
    message: input.scopeLabel
      ? `You were appointed ${position} for ${input.scopeLabel}.`
      : `You were appointed ${position}.`,
    link: "/portal/dashboard",
    entity_type: "organizational_assignment",
    entity_id: input.memberId,
  });
}

/* ============================================================
 * READ — BELL SUBSCRIPTION
 * ============================================================ */

/**
 * Live inbox for one user, newest first, capped at the 100 most recent
 * rows. Returns the unsubscribe function `onSnapshot()` hands back.
 */
export function subscribeToNotifications(
  userId: string,
  onChange: (items: AppNotification[]) => void,
): () => void {
  if (!userId) return () => {};

  return onSnapshot(
    query(
      collection(db, COLLECTION),
      where("user_id", "==", userId),
      orderBy("created_at", "desc"),
      limit(BELL_LIMIT),
    ),
    (snapshot) => {
      onChange(
        snapshot.docs.map((item) => mapNotification(item.id, item.data())),
      );
    },
    (error) => {
      console.error("Failed to watch notifications:", error);
    },
  );
}

/* ============================================================
 * WRITE — READ STATE
 * ============================================================ */

export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  if (!notificationId) return;

  await updateDoc(doc(db, COLLECTION, notificationId), {
    read: true,
    read_at: serverTimestamp(),
  });
}

/**
 * Mark the given rows read in one batch.
 *
 * The bell passes the ids it already holds, so no query is needed and a
 * user with more than 100 rows still marks exactly what they can see.
 */
export async function markNotificationsRead(
  notificationIds: string[],
): Promise<void> {
  const unique = Array.from(new Set(notificationIds.filter(Boolean)));
  if (unique.length === 0) return;

  for (let index = 0; index < unique.length; index += 450) {
    const batch = writeBatch(db);

    for (const id of unique.slice(index, index + 450)) {
      batch.update(doc(db, COLLECTION, id), {
        read: true,
        read_at: serverTimestamp(),
      });
    }

    await batch.commit();
  }
}
