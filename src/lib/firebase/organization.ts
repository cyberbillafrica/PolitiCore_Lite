"use client";

import { collection, getDocs, query, where } from "firebase/firestore";

import { db } from "./config";

import type { OrganizationalAssignment, PermissionGrant } from "@/types";

/**
 * Get all organizational assignments belonging to the
 * currently authenticated user.
 *
 * Firestore rules require the query to be constrained by
 * user_id, so this is intentionally scoped.
 */
export async function getUserOrganizationalAssignments(
  userId: string,
): Promise<OrganizationalAssignment[]> {
  const q = query(
    collection(db, "organizational_assignments"),
    where("user_id", "==", userId),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as OrganizationalAssignment[];
}

/**
 * Get all explicit permission grants belonging to the
 * currently authenticated user.
 */
export async function getUserPermissionGrants(
  userId: string,
): Promise<PermissionGrant[]> {
  const q = query(
    collection(db, "permission_grants"),
    where("user_id", "==", userId),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as PermissionGrant[];
}

/**
 * Only assignments that are currently active should affect
 * application access.
 */
export function getActiveAssignments(
  assignments: OrganizationalAssignment[],
): OrganizationalAssignment[] {
  return assignments.filter((assignment) => assignment.status === "active");
}

/**
 * Only explicitly granted permissions should be returned.
 *
 * A grant with granted:false acts as an explicit denial and
 * therefore remains available to the permission resolver.
 */
export function getActivePermissionGrants(
  grants: PermissionGrant[],
): PermissionGrant[] {
  return grants;
}

