// src/lib/firebase/manifesto.ts

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import type { ManifestoData } from "@/types";

const COLLECTION = "manifestos";
const DOC_ID = "main";

/**
 * Read the campaign manifesto (flat doc `manifestos/main`).
 */
export async function getManifesto(): Promise<ManifestoData | null> {
  try {
    const ref = doc(db, COLLECTION, DOC_ID);
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

export async function updateManifesto(
  data: ManifestoData,
): Promise<void> {
  const ref = doc(db, COLLECTION, DOC_ID);

  await setDoc(
    ref,
    {
      ...data,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function manifestoExists(): Promise<boolean> {
  const data = await getManifesto();
  return data !== null;
}
