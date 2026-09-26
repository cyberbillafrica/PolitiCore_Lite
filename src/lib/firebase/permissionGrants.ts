import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";

import { db } from "./config";

import type { Permission, PermissionGrant, ScopeType } from "@/types";

const COLLECTION = "permission_grants";

// ============================================================
// GET USER GRANTS
// ============================================================

export async function getUserPermissionGrants(
  userId: string,
): Promise<PermissionGrant[]> {
  const q = query(collection(db, COLLECTION), where("user_id", "==", userId));

  const snap = await getDocs(q);

  return snap.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  })) as PermissionGrant[];
}

// ============================================================
// GET ALL GRANTS (ADMIN)
// ============================================================

export async function getAllPermissionGrants(): Promise<PermissionGrant[]> {
  const q = query(collection(db, COLLECTION));

  const snap = await getDocs(q);

  return snap.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  })) as PermissionGrant[];
}

// ============================================================
// GET GRANTS BY USER ID (ADMIN)
// ============================================================

export async function getPermissionGrantsByUserId(
  userId: string,
): Promise<PermissionGrant[]> {
  const q = query(collection(db, COLLECTION), where("user_id", "==", userId));

  const snap = await getDocs(q);

  return snap.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  })) as PermissionGrant[];
}

// ============================================================
// CREATE GRANT
// ============================================================

export async function createPermissionGrant(data: {
  tenant_id: string;

  user_id: string;

  permission: Permission;

  granted: boolean;

  scope_type?: ScopeType | null;
  scope_id?: string | null;

  granted_by: string;
}) {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,

    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  return ref.id;
}

// ============================================================
// UPDATE GRANT
// ============================================================

export async function updatePermissionGrant(
  grantId: string,
  data: Partial<{
    permission: Permission;
    granted: boolean;
    scope_type: ScopeType | null;
    scope_id: string | null;
  }>,
): Promise<void> {
  const grantRef = doc(db, COLLECTION, grantId);

  await updateDoc(grantRef, {
    ...data,
    updated_at: serverTimestamp(),
  });
}

// ============================================================
// DELETE GRANT
// ============================================================

export async function deletePermissionGrant(grantId: string): Promise<void> {
  const grantRef = doc(db, COLLECTION, grantId);

  await deleteDoc(grantRef);
}

