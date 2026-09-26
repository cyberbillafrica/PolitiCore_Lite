import type { MembershipType } from "@/types";
import { nkanuWestElectoralData } from "@/data/electoral";

export const electoralWards = nkanuWestElectoralData;

export const fallbackLGA = {
  id: "nkanu-west",
  code: "NW",
  name: "Nkanu West",
  wards: nkanuWestElectoralData,
};

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

export const socialPlatforms = ["facebook", "x", "instagram", "tiktok"] as const;

export const parties = [
  { id: "apc", name: "All Progressive Congress", color: "#1B4F72" },
  { id: "pdp", name: "Peoples Democratic Party", color: "#27AE60" },
  { id: "ndc", name: "Nigeria Democratic Congress", color: "#E74C3C" },
] as const;

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
  if (!ward) return { ward: null, pollingUnit: null };

  const pollingUnit = pollingUnitId
    ? ward.pollingUnits.find((pu) => pu.id === pollingUnitId)
    : null;

  return { ward, pollingUnit: pollingUnit ?? null };
}

export async function getAllLGAs() {
  return [fallbackLGA];
}

export async function getLGA(id: string) {
  return id === "nkanu-west" || !id ? fallbackLGA : null;
}
