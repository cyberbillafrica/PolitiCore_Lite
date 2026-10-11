import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import type {
  EnuguStateElectoralData,
  LGA,
  Ward,
  PollingUnit,
} from "@/types";

const ELECTORAL_DATA_COLLECTION = "electoral_data";
const ENUGU_STATE_DOC_ID = "enugu-state";

/**
 * Retrieves the complete Enugu State electoral data document from Firestore.
 */
export async function getEnuguElectoralData(): Promise<EnuguStateElectoralData | null> {
  try {
    const docRef = doc(db, ELECTORAL_DATA_COLLECTION, ENUGU_STATE_DOC_ID);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as EnuguStateElectoralData;
    }

    return null;
  } catch (err) {
    console.error("Error fetching Enugu electoral data from Firestore:", err);
    return null;
  }
}

/**
 * Retrieves all LGAs in Enugu State.
 */
export async function getLGAs(): Promise<LGA[]> {
  const data = await getEnuguElectoralData();
  return data?.lgas ?? [];
}

/**
 * Retrieves a single LGA by its ID (e.g. "nkanu-west", "nsukka").
 */
export async function getLGAById(id: string): Promise<LGA | null> {
  const lgas = await getLGAs();
  return lgas.find((lga) => lga.id === id) ?? null;
}

/**
 * Retrieves a Ward by LGA ID and Ward ID.
 */
export async function getWardById(
  lgaId: string,
  wardId: string,
): Promise<Ward | null> {
  const lga = await getLGAById(lgaId);
  if (!lga) return null;

  return lga.wards.find((ward) => ward.id === wardId) ?? null;
}

/**
 * Retrieves a Polling Unit by LGA ID, Ward ID, and PU ID.
 */
export async function getPollingUnitById(
  lgaId: string,
  wardId: string,
  puId: string,
): Promise<PollingUnit | null> {
  const ward = await getWardById(lgaId, wardId);
  if (!ward) return null;

  return ward.pollingUnits.find((pu) => pu.id === puId) ?? null;
}

/**
 * Seeds or overwrites the electoral_data/enugu-state document in Firestore.
 */
export async function seedElectoralData(
  data: EnuguStateElectoralData,
): Promise<void> {
  const docRef = doc(db, ELECTORAL_DATA_COLLECTION, ENUGU_STATE_DOC_ID);

  await setDoc(docRef, {
    state: data.state || "Enugu",
    lgas: data.lgas,
    updated_at: serverTimestamp(),
  });
}

/**
 * Checks whether the electoral_data/enugu-state document exists in Firestore.
 */
export async function electoralDataExists(): Promise<boolean> {
  try {
    const docRef = doc(db, ELECTORAL_DATA_COLLECTION, ENUGU_STATE_DOC_ID);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  } catch {
    return false;
  }
}
