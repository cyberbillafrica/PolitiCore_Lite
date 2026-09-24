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
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  nin: string;
  state: string;
  lga: string;
  ward: string;
  gender: string;
  qualification: "OND" | "HND" | "Degree" | string;
  position: "APO" | "PO" | "SPO" | string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  maritalStatus: string;
  submittedByName?: string;
  submittedByPosition?: string;
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

export const QUALIFICATIONS = ["OND", "HND", "Degree"] as const;

export const POSITIONS = [
  { value: "APO", label: "Assistant Presiding Officer (APO)" },
  { value: "PO", label: "Presiding Officer (PO)" },
  { value: "SPO", label: "Supervisory Presiding Officer (SPO)" },
] as const;

export const MARITAL_STATUSES = [
  "Single",
  "Married",
  "Divorced",
  "Widowed",
] as const;

const COLLECTION_NAME = "inec_officers";

const LOCAL_STORE_KEY = "politicore_inec_officers_local";

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
      const firstName = data.firstName || "";
      const middleName = data.middleName || "";
      const lastName = data.lastName || "";
      const fullName =
        data.fullName ||
        [firstName, middleName, lastName].filter(Boolean).join(" ") ||
        "N/A";

      return {
        id: docSnap.id,
        firstName,
        middleName,
        lastName,
        fullName,
        email: data.email || "",
        phone: data.phone || "",
        address: data.address || "",
        nin: data.nin || "",
        state: data.state || "Default State",
        lga: data.lga || "",
        ward: data.ward || "",
        gender: data.gender || "",
        qualification: data.qualification || "",
        position: data.position || "",
        bankName: data.bankName || "",
        accountNumber: data.accountNumber || "",
        accountName: data.accountName || "",
        maritalStatus: data.maritalStatus || "",
        submittedByName: data.submittedByName || undefined,
        submittedByPosition: data.submittedByPosition || undefined,
        createdAt: data.createdAt,
      };
    });

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
