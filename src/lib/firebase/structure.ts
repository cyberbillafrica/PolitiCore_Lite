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
  tenant_id?: string;
  name: string;
  position: string;
  altTitle?: string;
  zone?: string;
  level: "STATE" | "ZONAL" | "LGA";
  phone?: string;
  email?: string;
  ward?: string;
  image_url?: string | null;
  display_order?: number;
  created_at?: unknown;
  updated_at?: unknown;
}

export const INITIAL_STRUCTURE_MEMBERS: StructureMember[] = [
  // STATE EXECUTIVE
  {
    id: "director",
    name: "Chief Godwin Obasi",
    position: "Director",
    altTitle: "Eze Ana Eri Ifeya On'enwe Amuri 1 of Enugu State",
    level: "STATE",
    image_url: "/img/director.jpg",
    display_order: 1,
  },
  {
    id: "deputy",
    name: "Chief Michael Unodiaku",
    position: "Deputy Director",
    level: "STATE",
    image_url: "/img/deputy.jpg",
    display_order: 2,
  },
  {
    id: "special-duties",
    name: "Com. Emeka Elengwu",
    position: "Director, Special Duties",
    level: "STATE",
    image_url: "/img/special-duties.jpg",
    display_order: 3,
  },
  {
    id: "operations",
    name: "Nwobodo Emmanuel Ndubeze (NZE)",
    position: "Director, Operations",
    level: "STATE",
    image_url: "/img/operations.jpg",
    display_order: 4,
  },
  {
    id: "media",
    name: "Mr. Chidiebere Onwudiwe",
    position: "Media Director",
    level: "STATE",
    image_url: "/img/media.jpg",
    display_order: 5,
  },
  {
    id: "youth",
    name: "Hon. Agu Ogbonna",
    position: "Youth Leader",
    level: "STATE",
    image_url: "/img/youth.jpg",
    display_order: 6,
  },
  {
    id: "women",
    name: "Evang. Favour Chinagoru",
    position: "Women Leader",
    level: "STATE",
    image_url: "/img/women.jpg",
    display_order: 7,
  },
  {
    id: "pension",
    name: "Onyiocha Eric",
    position: "Pensioner Coordinator",
    level: "STATE",
    image_url: "/img/pension.jpg",
    display_order: 8,
  },
  {
    id: "legal",
    name: "Barr. Ikechukwu Chijioke Eze",
    position: "Legal Adviser",
    level: "STATE",
    image_url: "/img/legal.jpg",
    display_order: 9,
  },
  {
    id: "secretary",
    name: "NZE Jerrylinus Okoro",
    position: "Secretary",
    level: "STATE",
    image_url: "/img/secretary.jpg",
    display_order: 10,
  },

  // ZONAL
  {
    id: "east-cord",
    name: "Apostle Darlington Chukwuemeka Nwatu",
    position: "Coordinator, Contact & Mobilization",
    zone: "Enugu East Senatorial Zone",
    level: "ZONAL",
    image_url: "/img/east-cord.jpg",
    display_order: 1,
  },
  {
    id: "west-cord",
    name: "Chief Jude Ejike Okuli",
    position: "Zonal Coordinator",
    zone: "Enugu West Senatorial Zone",
    level: "ZONAL",
    image_url: "/img/west-cord.jpg",
    display_order: 2,
  },
  {
    id: "north-cord",
    name: "Ezugwu Pius Ndubuisi",
    position: "Zonal Coordinator",
    zone: "Enugu North Senatorial Zone",
    level: "ZONAL",
    image_url: "/img/north-cord.jpg",
    display_order: 3,
  },

  // LGA
  {
    id: "aninri",
    name: "Okoro Damian Amobi",
    position: "Aninri LGA Coordinator",
    level: "LGA",
    image_url: "/img/aninri.jpg",
    display_order: 1,
  },
  {
    id: "awgu",
    name: "Aguocha Mezaya",
    position: "Awgu LGA Coordinator",
    level: "LGA",
    image_url: "/img/awgu.jpg",
    display_order: 2,
  },
  {
    id: "enugu-east",
    name: "Mr. Chiduabo Chukwuemeka",
    position: "Enugu East LGA Coordinator",
    level: "LGA",
    image_url: "/img/enugu-east.jpg",
    display_order: 3,
  },
  {
    id: "enugu-north",
    name: "Godwin Otita",
    position: "Enugu North LGA Coordinator",
    level: "LGA",
    image_url: "/img/enugu-north.jpg",
    display_order: 4,
  },
  {
    id: "enugu-south",
    name: "Hon. Stanley Ikechukwu Obi",
    position: "Enugu South LGA Coordinator",
    level: "LGA",
    image_url: "/img/enugu-south.jpg",
    display_order: 5,
  },
  {
    id: "ezeagu",
    name: "Hon. Edward Chiekwe Nwankwo",
    position: "Ezeagu LGA Coordinator",
    level: "LGA",
    image_url: "/img/ezeagu.jpg",
    display_order: 6,
  },
  {
    id: "igbo-eze-north",
    name: "Chief Abugu Sunday",
    position: "Igbo-Eze North LGA Coordinator",
    level: "LGA",
    image_url: "/img/igbo-eze-north.jpg",
    display_order: 7,
  },
  {
    id: "igbo-eze-south",
    name: "Ezema Okwudili Livinus",
    position: "Igbo-Eze South Chairman",
    level: "LGA",
    image_url: "/img/igbo-eze-south.jpg",
    display_order: 8,
  },
  {
    id: "isi-uzo",
    name: "Surv. Anderson Ikechukwu Chinonso",
    position: "Isi-Uzo LGA Coordinator",
    level: "LGA",
    image_url: "/img/isi-uzo.jpg",
    display_order: 9,
  },
  {
    id: "nkanu-west",
    name: "Mr. Kelechi Nnaji",
    position: "Nkanu West LGA Coordinator",
    level: "LGA",
    image_url: "/img/nkanu-west.jpg",
    display_order: 10,
  },
  {
    id: "nsukka",
    name: "Mr. Charles Ugwu",
    position: "Nsukka LGA Coordinator",
    level: "LGA",
    image_url: "/img/nsukka.jpg",
    display_order: 11,
  },
  {
    id: "oji-river",
    name: "Mr. Sunday Onyegbara",
    position: "Oji River LGA Coordinator",
    level: "LGA",
    image_url: "/img/oji-river.jpg",
    display_order: 12,
  },
  {
    id: "udi",
    name: "Mr. Eze Michael Nnebedum",
    position: "Udi LGA Coordinator",
    level: "LGA",
    image_url: "/img/udi.jpg",
    display_order: 13,
  },
  {
    id: "uzo-uwani",
    name: "Hon. Felix Jideofor Alumona",
    position: "Uzo-Uwani Chairman",
    level: "LGA",
    image_url: "/img/uzo-uwani.jpg",
    display_order: 14,
  },
];

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

    if (members.length === 0) {
      return INITIAL_STRUCTURE_MEMBERS;
    }

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
    console.error("Error fetching structure members, returning seed data:", error);
    return INITIAL_STRUCTURE_MEMBERS;
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
