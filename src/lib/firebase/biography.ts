// src/lib/firebase/biography.ts

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import type { BiographyData } from "@/types";

const COLLECTION = "biographies";
const DOC_ID = "main";

/**
 * Read the candidate biography.
 *
 * The bio lives in one flat document (`biographies/main`).
 */
export async function getBiography(): Promise<BiographyData | null> {
  try {
    const ref = doc(db, COLLECTION, DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as BiographyData;
  } catch (error) {
    console.error("Error fetching biography:", error);
    return null;
  }
}

export async function updateBiography(
  data: BiographyData,
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
