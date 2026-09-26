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
    tenant_id: String(data.tenant_id ?? ""),
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
  tenant_id: string;
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

  await updateDoc(assignmentRef, {
    ...data,
    updated_at: serverTimestamp(),
  });
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

  await deleteDoc(assignmentRef);
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

