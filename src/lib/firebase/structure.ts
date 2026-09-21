// src/lib/firebase/structure.ts

import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./config";

export interface StructureMember {
  id: string;
  tenant_id: string;
  name: string;
  position: string;
  level: "STATE" | "ZONAL" | "LGA";
  phone?: string;
  email?: string;
  ward?: string;
  image_url?: string | null;
  display_order?: number;
  created_at?: unknown;
  updated_at?: unknown;
}

const COLLECTION = "structure_members";

/**
 * Get all structure members for a tenant
 */
export async function getStructureMembers(
  tenantId: string
): Promise<StructureMember[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where("tenant_id", "==", tenantId)
    );
    const snap = await getDocs(q);

    const members: StructureMember[] = [];
    snap.forEach((docSnap) => {
      members.push({
        id: docSnap.id,
        ...docSnap.data(),
      } as StructureMember);
    });

    // Sort by level and display_order in memory
    const levelOrder: Record<string, number> = {
      STATE: 1,
      ZONAL: 2,
      LGA: 3,
    };

    members.sort((a, b) => {
      const levelDiff = (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9);
      if (levelDiff !== 0) return levelDiff;
      return (a.display_order || 0) - (b.display_order || 0);
    });

    return members;
  } catch (error) {
    console.error("Error fetching structure members:", error);
    return [];
  }
}

/**
 * Create or update a structure member
 */
export async function saveStructureMember(
  tenantId: string,
  memberData: Omit<StructureMember, "tenant_id" | "created_at" | "updated_at">
): Promise<string> {
  if (memberData.id) {
    const ref = doc(db, COLLECTION, memberData.id);
    await setDoc(
      ref,
      {
        ...memberData,
        tenant_id: tenantId,
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );
    return memberData.id;
  } else {
    const ref = collection(db, COLLECTION);
    const docRef = await addDoc(ref, {
      ...memberData,
      tenant_id: tenantId,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    return docRef.id;
  }
}

/**
 * Delete a structure member
 */
export async function deleteStructureMember(id: string): Promise<void> {
  const ref = doc(db, COLLECTION, id);
  await deleteDoc(ref);
}
