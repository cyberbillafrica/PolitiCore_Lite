import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./config";

export interface InecOfficer {
  id?: string;
  fullName: string;
  phone: string;
  lga: string;
  ward: string;
  gender: string;
  qualification: string;
  createdAt?: Timestamp | Date | string | any;
}

export const ENUGU_LGAS = [
  "Aninri",
  "Awgu",
  "Enugu East",
  "Enugu North",
  "Enugu South",
  "Ezeagu",
  "Igbo Etiti",
  "Igbo Eze North",
  "Igbo Eze South",
  "Isi Uzo",
  "Nkanu East",
  "Nkanu West",
  "Nsukka",
  "Oji River",
  "Udenu",
  "Udi",
  "Uzo Uwani",
];

const COLLECTION_NAME = "inec_officers";

// Local storage key for fallback / demo offline store
const LOCAL_STORE_KEY = "dcm_enugu_inec_officers_local";

function getLocalOfficers(): InecOfficer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalOfficer(officer: InecOfficer) {
  if (typeof window === "undefined") return;
  try {
    const existing = getLocalOfficers();
    localStorage.setItem(
      LOCAL_STORE_KEY,
      JSON.stringify([officer, ...existing])
    );
  } catch (err) {
    console.error("Local storage save error:", err);
  }
}

export async function registerInecOfficer(
  data: Omit<InecOfficer, "id" | "createdAt">
): Promise<string> {
  const localOfficer: InecOfficer = {
    ...data,
    id: "local_" + Date.now(),
    createdAt: new Date().toISOString(),
  };

  saveLocalOfficer(localOfficer);

  try {
    const colRef = collection(db, COLLECTION_NAME);

    // Timeout promise to prevent UI hanging when firebase demo config is used offline
    const addPromise = addDoc(colRef, {
      ...data,
      createdAt: serverTimestamp(),
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Firestore write timeout")), 3000)
    );

    const docRef = (await Promise.race([addPromise, timeoutPromise])) as any;
    return docRef.id;
  } catch (error) {
    console.warn("Firestore write fallback to local session store:", error);
    return localOfficer.id!;
  }
}

export async function getAllInecOfficers(): Promise<InecOfficer[]> {
  const localItems = getLocalOfficers();

  try {
    const colRef = collection(db, COLLECTION_NAME);
    const q = query(colRef, orderBy("createdAt", "desc"));

    const fetchPromise = getDocs(q);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Firestore fetch timeout")), 3000)
    );

    const snapshot = (await Promise.race([
      fetchPromise,
      timeoutPromise,
    ])) as any;

    const firestoreItems = snapshot.docs.map((docSnap: any) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        fullName: data.fullName || "",
        phone: data.phone || "",
        lga: data.lga || "",
        ward: data.ward || "",
        gender: data.gender || "",
        qualification: data.qualification || "",
        createdAt: data.createdAt,
      };
    });

    // Merge firestore items with local items without duplicates
    const allIds = new Set(firestoreItems.map((f: InecOfficer) => f.id));
    const uniqueLocal = localItems.filter((l) => !allIds.has(l.id));

    return [...uniqueLocal, ...firestoreItems];
  } catch (error) {
    console.warn("Firestore fetch fallback to local store:", error);
    return localItems;
  }
}

export async function deleteInecOfficer(id: string): Promise<void> {
  if (typeof window !== "undefined" && id.startsWith("local_")) {
    const existing = getLocalOfficers();
    localStorage.setItem(
      LOCAL_STORE_KEY,
      JSON.stringify(existing.filter((item) => item.id !== id))
    );
  }

  try {
    if (!id.startsWith("local_")) {
      const docRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(docRef);
    }
  } catch (error) {
    console.error("Error deleting INEC officer:", error);
  }
}
