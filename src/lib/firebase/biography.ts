// src/lib/firebase/biography.ts

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import type { BiographyData } from "@/types";

const COLLECTION = "biographies";

export async function getBiography(
  tenantId: string,
): Promise<BiographyData | null> {
  try {
    const ref = doc(db, COLLECTION, tenantId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as BiographyData;
  } catch (error) {
    console.error("Error fetching biography:", error);
    return null;
  }
}

export async function updateBiography(
  tenantId: string,
  data: BiographyData,
): Promise<void> {
  const ref = doc(db, COLLECTION, tenantId);
  await setDoc(
    ref,
    {
      ...data,
      tenant_id: tenantId,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
}

