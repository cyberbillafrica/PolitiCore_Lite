// src/lib/firebase/manifesto.ts

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import type { ManifestoData } from "@/types";

const COLLECTION = "manifestos";

/**
 * Get a tenant's manifesto
 */
export async function getManifesto(tenantId: string): Promise<ManifestoData | null> {
  try {
    const ref = doc(db, COLLECTION, tenantId);
    const snap = await getDoc(ref);
    
    if (!snap.exists()) {
      return null;
    }
    
    return snap.data() as ManifestoData;
  } catch (error) {
    console.error("Error fetching manifesto:", error);
    return null;
  }
}

/**
 * Save/update a tenant's manifesto
 */
export async function updateManifesto(
  tenantId: string,
  data: ManifestoData
): Promise<void> {
  const ref = doc(db, COLLECTION, tenantId);
  
  await setDoc(
    ref,
    {
      ...data,
      tenant_id: tenantId,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Check if a manifesto exists
 */
export async function manifestoExists(tenantId: string): Promise<boolean> {
  const data = await getManifesto(tenantId);
  return data !== null;
}
