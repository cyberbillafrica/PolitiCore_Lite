import type { CampaignScope } from "@/lib/campaign-scope";
import type { LGA, Ward } from "@/types";

/*
 * ============================================================
 * FULL-SIZE HIERARCHY FIXTURE
 * ============================================================
 *
 * `helpers.ts` ships a deliberately tiny hierarchy (3 wards in
 * Nkanu West) so the behaviour tests stay fast. That is fine for a
 * single-scope rule check, but it cannot reproduce the elevated-
 * coordinator read bug: the failure appears only when a query's
 * `in` list grows past the Firestore rules access budget.
 *
 * This fixture mirrors production scale for the two shapes that
 * matter:
 *
 *   Nkanu West .... 14 wards   (the real LGA)
 *   Enugu East .... 3 LGAs x (14 + 10 + 10) wards = 34 wards
 *
 * The LGAs are real ids from `electoral_data/enugu-state` and all
 * three sit in the Enugu East senatorial zone per
 * `ENUGU_CONSTITUENCIES`, so `zoneIdForLga()` and
 * `lookupConstituencyLgaIds()` expand the zone exactly as they do in
 * the app. A projection derived from this fixture therefore produces
 * the same grant shapes production holds — 187 for an LGA
 * coordinator, 462 for a zone coordinator.
 */

function buildWards(lgaId: string, count: number): Ward[] {
  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    const wardId = `${lgaId}-ward-${number}`;

    return {
      id: wardId,
      code: `W${number}`,
      name: `Ward ${number}`,
      pollingUnits: [{ id: `${wardId}-pu-001`, code: "001", name: "PU 001" }],
    };
  });
}

export const NKANU_WEST = "nkanu-west";
export const NKANU_EAST = "nkanu-east";
export const ISI_UZO = "isi-uzo";
export const ZONE = "enugu-east";
export const STATE = "enugu-state";

const nkanuWestWards = buildWards(NKANU_WEST, 14).map((ward) =>
  ward.id === `${NKANU_WEST}-ward-14`
    ? {
        ...ward,
        pollingUnits: [
          ...ward.pollingUnits,
          { id: `${ward.id}-pu-007`, code: "007", name: "PU 007" },
        ],
      }
    : ward,
);

export const FULL_LGAS: LGA[] = [
  {
    id: NKANU_WEST,
    code: "NW",
    name: "Nkanu West",
    wards: nkanuWestWards,
  },
  {
    id: NKANU_EAST,
    code: "NE",
    name: "Nkanu East",
    wards: buildWards(NKANU_EAST, 10),
  },
  {
    id: ISI_UZO,
    code: "IU",
    name: "Isi-Uzo",
    wards: buildWards(ISI_UZO, 10),
  },
];

/** Every ward in the LGA coordinator's authority. */
export const NKANU_WEST_WARD_IDS: string[] = FULL_LGAS[0].wards.map(
  (ward) => ward.id,
);

/** Every LGA the zone coordinator covers. */
export const ZONE_LGA_IDS: string[] = FULL_LGAS.map((lga) => lga.id);

/** Every ward in the zone coordinator's authority (34). */
export const ZONE_WARD_IDS: string[] = FULL_LGAS.flatMap((lga) =>
  lga.wards.map((ward) => ward.id),
);

export const ZONE_POLLING_UNIT_IDS: string[] = FULL_LGAS.flatMap((lga) =>
  lga.wards.flatMap((ward) => ward.pollingUnits.map((pu) => pu.id)),
);

/**
 * The registered home area used by every elevated coordinator here —
 * the same shape as Mr Timothy's live profile (ward 14, PU 007).
 */
export const HOME = {
  lga_id: NKANU_WEST,
  ward_id: `${NKANU_WEST}-ward-14`,
  polling_unit_id: `${NKANU_WEST}-ward-14-pu-007`,
} as const;

/** Layered activity/issue/assignment coverage, in different wards. */
export const LGA_WARD_SAMPLE = [
  `${NKANU_WEST}-ward-01`,
  `${NKANU_WEST}-ward-05`,
  `${NKANU_WEST}-ward-09`,
];

/** One representative ward in each LGA of the zone. */
export const ZONE_WARD_SAMPLE = [
  `${NKANU_WEST}-ward-02`,
  `${NKANU_EAST}-ward-03`,
  `${ISI_UZO}-ward-07`,
];

export function lgaScope(): CampaignScope {
  return {
    level: "lga",
    scope_id: NKANU_WEST,
    label: "Nkanu West LGA",
    lgaIds: [NKANU_WEST],
    wardIds: NKANU_WEST_WARD_IDS,
    pollingUnitIds: FULL_LGAS[0].wards.flatMap((ward) =>
      ward.pollingUnits.map((pu) => pu.id),
    ),
  };
}

export function zoneScope(): CampaignScope {
  return {
    level: "senatorial_zone",
    scope_id: ZONE,
    label: "Enugu East Zone",
    lgaIds: ZONE_LGA_IDS,
    wardIds: ZONE_WARD_IDS,
    pollingUnitIds: ZONE_POLLING_UNIT_IDS,
  };
}

export function stateScope(): CampaignScope {
  return {
    level: "state",
    scope_id: STATE,
    label: "Enugu State",
    lgaIds: ZONE_LGA_IDS,
    wardIds: ZONE_WARD_IDS,
    pollingUnitIds: ZONE_POLLING_UNIT_IDS,
  };
}
