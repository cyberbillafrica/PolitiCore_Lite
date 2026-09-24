import type { MembershipType } from "@/types";

import { nkanuWestElectoralData } from "@/data/electoral";

export const electoralWards = nkanuWestElectoralData;

export const membershipOptions: {
  value: MembershipType;
  label: string;
  description: string;
}[] = [
  {
    value: "campaign_member",
    label: "Campaign Member",
    description:
      "Participate in campaign council and organizational activities.",
  },

  {
    value: "social_member",
    label: "Social Member",
    description:
      "Participate in social-media activities, earn points and compete on the leaderboard.",
  },
];

export const socialPlatforms = [
  "facebook",
  "x",
  "instagram",
  "tiktok",
] as const;

export const parties = [
  {
    id: "apc",
    name: "All Progressive Congress",
    color: "#1B4F72",
  },
  {
    id: "pdp",
    name: "Peoples Democratic Party",
    color: "#27AE60",
  },
  {
    id: "ndc",
    name: "Nigeria Democratic Congress",
    color: "#E74C3C",
  },
] as const;

// Async functions with Firestore primary access + graceful fallbacks
export async function getAllLGAs(): Promise<LGA[]> {
  try {
    const lgas = await getLGAsFromFirestore();
    if (lgas && lgas.length > 0) {
      return lgas;
    }
  } catch (err) {
    console.error("Failed to load LGAs from Firestore:", err);
    throw new Error("Failed to load electoral data from database.");
  }
  return [];
}

export async function getLGA(id: string): Promise<LGA | null> {
  try {
    const lga = await getLGAByIdFromFirestore(id);
    if (lga) return lga;
  } catch (err) {
    console.error(
      `Failed to load LGA ${id} from Firestore, checking fallback:`,
      err,
    );
  }

  if (id === "nkanu-west" || !id) {
    return fallbackLGA;
  }
  return null;
}

export function getWardById(wardId?: string) {
  if (!wardId) return undefined;

  return nkanuWestElectoralData.find((ward) => ward.id === wardId);
}

export function getPollingUnitById(wardId?: string, pollingUnitId?: string) {
  if (!wardId || !pollingUnitId) return undefined;

  const ward = getWardById(wardId);

  return ward?.pollingUnits.find((pu) => pu.id === pollingUnitId);
}

export function getElectoralLocation(wardId?: string, pollingUnitId?: string) {
  const ward = getWardById(wardId);

  if (!ward) {
    return {
      ward: null,
      pollingUnit: null,
    };
  }

  const pollingUnit = pollingUnitId
    ? ward.pollingUnits.find((pu) => pu.id === pollingUnitId)
    : null;

  return {
    ward,
    pollingUnit: pollingUnit ?? null,
  };
}
