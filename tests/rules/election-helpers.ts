/*
 * Shared fixtures for the Round 10 election tests.
 *
 * Every seed writes with the rules disabled; assertions use the
 * authenticated client, which is the thing under test.
 */

import { doc, setDoc } from "firebase/firestore";

import { getTestEnv } from "./setup";
import { LGA, WARD_01, WARD_02 } from "./helpers";

export const CONTEST_ID = "contest-round10";
export const OTHER_CONTEST_ID = "contest-round10-other";

export const WARD_03 = "nkanu-west-ward-03";
export const WARD_04_PU = "nkanu-west-ward-04-pu-001";

export interface SeedResultInput {
  id?: string;
  contestId?: string;
  wardId?: string;
  pollingUnitId: string;
  submittedBy: string;
  status?: string;
  lgaId?: string;
  createdAt?: Date;
  results?: Array<{ party: string; votes: number }>;
}

/** The single election_settings document every rule reads. */
export async function seedElectionSettings(
  activeContestId = CONTEST_ID,
): Promise<void> {
  await getTestEnv().withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "election_settings", "default"), {
      active_contest_id: activeContestId,
      election_mode_enabled: true,
    });
  });
}

/**
 * A federal-constituency contest covering Nkanu West only. The
 * `lga_ids` list is what `activeContestAllowsLga()` consults.
 */
export async function seedContest(input: {
  id?: string;
  lga_ids?: string[];
  scope_type?: string;
  scope_id?: string;
} = {}): Promise<void> {
  const id = input.id ?? CONTEST_ID;

  await getTestEnv().withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "election_contests", id), {
      name: "Round 10 Test Constituency",
      election_cycle_id: "cycle-2027",
      contest_type: "federal_constituency",
      scope_type: input.scope_type ?? "federal_constituency",
      scope_id: input.scope_id ?? "nkanu-west",
      lga_ids: input.lga_ids ?? [LGA],
      tracked_parties: ["apc", "pdp", "adc", "ndc"],
    });
  });
}

export async function seedElectionResult(
  input: SeedResultInput,
): Promise<string> {
  const id =
    input.id ??
    `${input.contestId ?? CONTEST_ID}__${input.pollingUnitId}`;
  const wardId = input.wardId ?? WARD_01;

  await getTestEnv().withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "election_results", id), {
      contest_id: input.contestId ?? CONTEST_ID,
      lga_id: input.lgaId ?? LGA,
      ward_id: wardId,
      polling_unit_id: input.pollingUnitId,
      results: input.results ?? [
        { party: "apc", votes: 10 },
        { party: "pdp", votes: 20 },
      ],
      submitted_by: input.submittedBy,
      status: input.status ?? "approved",
      verified: (input.status ?? "approved") === "approved",
      cloudinary_url: "https://example.test/ec8.jpg",
      created_at: input.createdAt ?? new Date(),
      updated_at: input.createdAt ?? new Date(),
    });
  });

  return id;
}

/** The exact payload shape the create rule validates. */
export function resultPayload(input: {
  contestId?: string;
  wardId?: string;
  pollingUnitId: string;
  submittedBy: string;
  lgaId?: string;
}) {
  return {
    contest_id: input.contestId ?? CONTEST_ID,
    lga_id: input.lgaId ?? LGA,
    ward_id: input.wardId ?? WARD_01,
    polling_unit_id: input.pollingUnitId,
    results: [
      { party: "apc", votes: 11 },
      { party: "pdp", votes: 22 },
    ],
    submitted_by: input.submittedBy,
    status: "submitted",
    verified: false,
    cloudinary_url: "https://example.test/ec8-new.jpg",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

/** `view_election_results` and `upload_election_result` at one scope. */
export async function seedElectionGrants(
  uid: string,
  grants: Array<[permission: string, scopeType: string, scopeId: string]>,
): Promise<void> {
  await getTestEnv().withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    for (const [permission, scopeType, scopeId] of grants) {
      const id =
        scopeType === "global"
          ? `${uid}__${permission}__global`
          : `${uid}__${permission}__${scopeType}__${scopeId}`;

      await setDoc(doc(db, "user_access", id), {
        user_id: uid,
        permission,
        allowed: true,
        scope_type: scopeType,
        scope_id: scopeId,
        updated_at: new Date(),
      });
    }
  });
}

/** Four ward-01 polling units, for the "all results" assertion. */
export const WARD_01_PUS = [
  "nkanu-west-ward-01-pu-001",
  "nkanu-west-ward-01-pu-002",
  "nkanu-west-ward-01-pu-003",
  "nkanu-west-ward-01-pu-004",
];

export const WARD_02_PU = "nkanu-west-ward-02-pu-001";
export { WARD_01, WARD_02 };
