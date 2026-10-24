"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase/config";
import { notifyRoleAssigned } from "./notifications";
import {
  revokeElectionResultAccessForAssignment,
  syncCampaignAccessForUser,
  syncElectionResultAccessForAssignment,
} from "./userAccess";
import type {
  OrganizationalAssignment,
  OrganizationalPosition,
  OrganizationalAssignmentStatus,
  ScopeType,
} from "@/types";

/*
 * ============================================================
 * FIRESTORE COLLECTION
 * ============================================================
 */

const COLLECTION = "organizational_assignments";

/*
 * ============================================================
 * FIRESTORE → APPLICATION MAPPER
 * ============================================================
 */

function mapAssignment(
  id: string,
  data: Record<string, unknown>,
): OrganizationalAssignment {
  return {
    id,
    user_id: String(data.user_id ?? ""),
    position: data.position as OrganizationalPosition,
    scope_type: data.scope_type as ScopeType,
    scope_id: String(data.scope_id ?? ""),
    status: data.status as OrganizationalAssignment["status"],
    assigned_by: String(data.assigned_by ?? ""),
    assigned_at: data.assigned_at,
    starts_at: data.starts_at,
    ends_at: data.ends_at,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/*
 * ============================================================
 * GET ALL ASSIGNMENTS FOR A USER
 * ============================================================
 */

export async function getUserOrganizationalAssignments(
  userId: string,
): Promise<OrganizationalAssignment[]> {
  if (!userId) {
    return [];
  }

  const assignmentsRef = collection(db, COLLECTION);

  const q = query(
    assignmentsRef,
    where("user_id", "==", userId),
    orderBy("created_at", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((assignmentDoc) =>
    mapAssignment(assignmentDoc.id, assignmentDoc.data()),
  );
}

/*
 * ============================================================
 * GET ACTIVE ASSIGNMENTS ONLY
 * ============================================================
 */

export async function getActiveOrganizationalAssignments(
  userId: string,
): Promise<OrganizationalAssignment[]> {
  if (!userId) {
    return [];
  }

  const assignmentsRef = collection(db, COLLECTION);

  const q = query(
    assignmentsRef,
    where("user_id", "==", userId),
    where("status", "==", "active"),
    orderBy("created_at", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((assignmentDoc) =>
    mapAssignment(assignmentDoc.id, assignmentDoc.data()),
  );
}

/*
 * ============================================================
 * GET ALL ASSIGNMENTS (ADMIN)
 * ============================================================
 */

export async function getAllOrganizationalAssignments(): Promise<
  OrganizationalAssignment[]
> {
  const assignmentsRef = collection(db, COLLECTION);

  const q = query(assignmentsRef, orderBy("created_at", "desc"));

  const snapshot = await getDocs(q);

  return snapshot.docs.map((assignmentDoc) =>
    mapAssignment(assignmentDoc.id, assignmentDoc.data()),
  );
}

/*
 * ============================================================
 * GET ASSIGNMENTS BY USER ID (ADMIN)
 * ============================================================
 */

export async function getOrganizationalAssignmentsByUserId(
  userId: string,
): Promise<OrganizationalAssignment[]> {
  if (!userId) {
    return [];
  }

  const assignmentsRef = collection(db, COLLECTION);

  const q = query(
    assignmentsRef,
    where("user_id", "==", userId),
    orderBy("created_at", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((assignmentDoc) =>
    mapAssignment(assignmentDoc.id, assignmentDoc.data()),
  );
}

/*
 * ============================================================
 * GET A SINGLE ASSIGNMENT
 * ============================================================
 */

export async function getOrganizationalAssignment(
  assignmentId: string,
): Promise<OrganizationalAssignment | null> {
  if (!assignmentId) {
    return null;
  }

  const assignmentRef = doc(db, COLLECTION, assignmentId);

  const snapshot = await getDoc(assignmentRef);

  if (!snapshot.exists()) {
    return null;
  }

  return mapAssignment(snapshot.id, snapshot.data());
}

/*
 * ============================================================
 * CREATE ASSIGNMENT
 * ============================================================
 */

export async function createOrganizationalAssignment(data: {
  user_id: string;
  position: OrganizationalPosition;
  scope_type: ScopeType;
  scope_id: string;
  status: OrganizationalAssignmentStatus;
  assigned_by: string;
  starts_at?: Timestamp | null;
  ends_at?: Timestamp | null;
}): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    assigned_at: serverTimestamp(),
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  /*
   * Project the assignment into the `user_access` index the Firestore
   * rules read.
   *
   * Two projections live side by side:
   *
   *   campaign permissions ... RECOMPUTED from the user's full state, so
   *                            the baseline is always present and a
   *                            previous position's grants cannot survive
   *   election results ....... additive per assignment
   *
   * The campaign recompute reads the assignments collection, so it sees
   * the assignment added just above.
   */
  await Promise.all([
    syncCampaignAccessForUser(data.user_id),
    data.status === "active"
      ? syncElectionResultAccessForAssignment(
          data.user_id,
          data.position,
          data.scope_type,
          data.scope_id,
        )
      : Promise.resolve(),
  ]);

  /* The appointment already exists; a failed notification must not undo it. */
  try {
    await notifyRoleAssigned({
      memberId: data.user_id,
      position: data.position,
      actorId: data.assigned_by,
    });
  } catch (error) {
    console.error("Failed to notify the appointed member:", error);
  }

  return ref.id;
}

/*
 * ============================================================
 * UPDATE ASSIGNMENT
 * ============================================================
 */

export async function updateOrganizationalAssignment(
  assignmentId: string,
  data: Partial<{
    position: OrganizationalPosition;
    scope_type: ScopeType;
    scope_id: string;
    status: OrganizationalAssignmentStatus;
    starts_at: Timestamp | null;
    ends_at: Timestamp | null;
  }>,
): Promise<void> {
  const assignmentRef = doc(db, COLLECTION, assignmentId);

  /*
   * Read the previous shape first: a changed scope or a suspension must
   * revoke the projection the rules were using until now.
   */
  const previous = await getOrganizationalAssignment(assignmentId);

  await updateDoc(assignmentRef, {
    ...data,
    updated_at: serverTimestamp(),
  });

  if (!previous) return;

  if (previous.status === "active") {
    await revokeElectionResultAccessForAssignment(
      previous.user_id,
      previous.position,
      previous.scope_type,
      previous.scope_id,
    );
  }

  const nextStatus = data.status ?? previous.status;

  if (nextStatus === "active") {
    await syncElectionResultAccessForAssignment(
      previous.user_id,
      data.position ?? previous.position,
      data.scope_type ?? previous.scope_type,
      data.scope_id ?? previous.scope_id,
    );
  }

  /*
   * Recompute the campaign projection from the user's full state: the
   * documents belonging to the previous position or scope are deleted,
   * the new ones are written, and the baseline is preserved.
   */
  await syncCampaignAccessForUser(previous.user_id);
}

/*
 * ============================================================
 * DELETE ASSIGNMENT
 * ============================================================
 */

export async function deleteOrganizationalAssignment(
  assignmentId: string,
): Promise<void> {
  const assignmentRef = doc(db, COLLECTION, assignmentId);

  /*
   * Read before deleting so the access projection can be revoked with
   * the same scope values that created it.
   */
  const previous = await getOrganizationalAssignment(assignmentId);

  await deleteDoc(assignmentRef);

  if (!previous) return;

  await revokeElectionResultAccessForAssignment(
    previous.user_id,
    previous.position,
    previous.scope_type,
    previous.scope_id,
  );

  /* The recompute deletes the removed assignment's grants and keeps the
   * baseline the member is still entitled to. */
  await syncCampaignAccessForUser(previous.user_id);
}

/*
 * ============================================================
 * FIND ASSIGNMENTS BY POSITION
 * ============================================================
 */

export async function getUserAssignmentsByPosition(
  userId: string,
  position: OrganizationalPosition,
): Promise<OrganizationalAssignment[]> {
  if (!userId) {
    return [];
  }

  const assignmentsRef = collection(db, COLLECTION);

  const q = query(
    assignmentsRef,
    where("user_id", "==", userId),
    where("position", "==", position),
    where("status", "==", "active"),
    orderBy("created_at", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((assignmentDoc) =>
    mapAssignment(assignmentDoc.id, assignmentDoc.data()),
  );
}

/*
 * ============================================================
 * FIND ASSIGNMENTS BY SCOPE
 * ============================================================
 */

export async function getUserAssignmentsByScope(
  userId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<OrganizationalAssignment[]> {
  if (!userId || !scopeId) {
    return [];
  }

  const assignmentsRef = collection(db, COLLECTION);

  const q = query(
    assignmentsRef,
    where("user_id", "==", userId),
    where("scope_type", "==", scopeType),
    where("scope_id", "==", scopeId),
    where("status", "==", "active"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((assignmentDoc) =>
    mapAssignment(assignmentDoc.id, assignmentDoc.data()),
  );
}

