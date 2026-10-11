import type { MembershipType } from "@/types";
import { nkanuWestElectoralData } from "@/data/electoral";

export const electoralWards = nkanuWestElectoralData;

/*
 * The LGA that owns the bundled ward/PU dataset.
 *
 * Both the id and the label are derived from the dataset itself
 * (ward ids are prefixed with their LGA id, e.g. "<lga-id>-ward-01")
 * so no LGA is ever hardcoded here. This object is only the offline
 * fallback for when the seeded `electoral_data/enugu-state` document
 * is unavailable — the live source of truth is the seeded data.
 */
function bundledLgaId(): string {
  const wardId = electoralWards[0]?.id ?? "";
  const marker = wardId.indexOf("-ward-");
  return marker > 0 ? wardId.slice(0, marker) : "";
}

function humanizeId(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const fallbackLGA = {
  id: bundledLgaId(),
  code: humanizeId(bundledLgaId())
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase())
    .join(""),
  name: humanizeId(bundledLgaId()),
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

/*
 * Bundled LGA list — the offline fallback only.
 *
 * Election surfaces should read the live, state-wide list from
 * `getAllEnuguLGAs()` in `@/lib/firebase/electoral`, which prefers
 * the seeded `electoral_data/enugu-state` document. This function
 * exists so the bundled dataset is still usable without a network.
 */
export async function getAllLGAs() {
  return [fallbackLGA];
}
