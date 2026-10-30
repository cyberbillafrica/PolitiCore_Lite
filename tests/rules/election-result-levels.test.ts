import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

import { getElectionResultsByWardAndLga } from "@/lib/firebase/firestore";

import { LGA, STATE } from "./helpers";
import {
  WARD_01,
  WARD_02,
  seedContest,
  seedElectionGrants,
  seedElectionResult,
  seedElectionSettings,
} from "./election-helpers";
import { authAs, seedUser } from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * Round 16A — collation levels.
 *
 *   EC8A polling unit  (legacy docs carry no result_level)
 *   EC8B ward          contest__ward__{ward}
 *   EC8C LGA           contest__lga__{lga}
 *   EC8D state         contest__state__{state}
 *
 * Each level is authorized by the coordinator delegation matrix:
 *
 *   ward coord  -> their ward only
 *   LGA coord   -> any ward / their LGA
 *   zone coord  -> the LGAs projected from their zone
 *   state coord -> global
 *   officer/admin -> within contest scope
 *
 * A fresh contest per case keeps every deterministic doc ID unique,
 * so a duplicate rejection is never an accident of seed order.
 */

const WARD_COORD = "levels-ward-coord";
const LGA_COORD = "levels-lga-coord";
const ZONE_COORD = "levels-zone-coord";
const STATE_COORD = "levels-state-coord";
const OFFICER = "levels-officer";
const ADMIN = "levels-admin";
const MEMBER = "levels-member";

const OUTSIDE_LGA = "nsukka";
const OUTSIDE_WARD = "nsukka-ward-01";

type Level = "polling_unit" | "ward" | "lga" | "state";

interface LevelInput {
  uid: string;
  contestId: string;
  level: Level;
  wardId?: string;
  lgaId?: string;
  stateId?: string;
  pollingUnitId?: string;
}

const contestCache = new Set<string>();

async function useContest(
  contestId: string,
  scope: { scope_type?: string; scope_id?: string; lga_ids?: string[] } = {},
): Promise<void> {
  if (!contestCache.has(contestId)) {
    await seedContest({ id: contestId, ...scope });
    contestCache.add(contestId);
  }

  await seedElectionSettings(contestId);
}

function docIdFor(input: LevelInput): string {
  switch (input.level) {
    case "ward":
      return `${input.contestId}__ward__${input.wardId}`;
    case "lga":
      return `${input.contestId}__lga__${input.lgaId}`;
    case "state":
      return `${input.contestId}__state__${input.stateId ?? STATE}`;
    default:
      return `${input.contestId}__${input.pollingUnitId}`;
  }
}

function payloadFor(input: LevelInput) {
  return {
    contest_id: input.contestId,
    contest_type: "federal_constituency",
    contest_scope: "federal_constituency",
    /* Uniform shape: empty string where the level does not apply. */
    state_id: input.stateId ?? "",
    lga_id: input.lgaId ?? "",
    ward_id: input.wardId ?? "",
    polling_unit_id: input.pollingUnitId ?? "",
    result_level: input.level,
    results: [
      { party: "apc", votes: 12 },
      { party: "pdp", votes: 19 },
    ],
    submitted_by: input.uid,
    status: "submitted",
    verified: false,
    cloudinary_url: "https://example.test/ec8-level.jpg",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

async function createLevel(input: LevelInput): Promise<void> {
  const client = authAs(input.uid);
  await setDoc(
    doc(client, "election_results", docIdFor(input)),
    payloadFor(input),
  );
}

const wardCollation = (
  uid: string,
  contestId: string,
  wardId = WARD_01,
  lgaId = LGA,
): LevelInput => ({ uid, contestId, level: "ward", wardId, lgaId });

const lgaCollation = (
  uid: string,
  contestId: string,
  lgaId = LGA,
): LevelInput => ({ uid, contestId, level: "lga", lgaId });

const stateCollation = (uid: string, contestId: string): LevelInput => ({
  uid,
  contestId,
  level: "state",
  stateId: STATE,
});

describe("election result levels — create authorization", () => {
  beforeAll(async () => {
    await initTestEnv();
    await clearDb();

    await seedElectionSettings("contest-levels-base");
    await seedContest({ id: "contest-levels-base" });

    await seedUser(WARD_COORD, { ward_id: WARD_01, lga_id: LGA });
    await seedElectionGrants(WARD_COORD, [
      ["upload_election_result", "ward", WARD_01],
      ["view_election_results", "ward", WARD_01],
    ]);

    await seedUser(LGA_COORD, { ward_id: WARD_01, lga_id: LGA });
    await seedElectionGrants(LGA_COORD, [
      ["upload_election_result", "lga", LGA],
      ["view_election_results", "lga", LGA],
    ]);

    /* A zone coordinator's projection carries an LGA grant per LGA. */
    await seedUser(ZONE_COORD, { ward_id: WARD_01, lga_id: LGA });
    await seedElectionGrants(ZONE_COORD, [
      ["upload_election_result", "lga", LGA],
      ["view_election_results", "lga", LGA],
    ]);

    await seedUser(STATE_COORD, { ward_id: WARD_01, lga_id: LGA });
    await seedElectionGrants(STATE_COORD, [
      ["upload_election_result", "global", ""],
      ["view_election_results", "global", ""],
    ]);

    await seedUser(OFFICER, { access_role: "election_officer" });
    await seedUser(ADMIN, { access_role: "admin" });
    await seedUser(MEMBER);
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  it("lets a ward coordinator create EC8B for their own ward", async () => {
    await useContest("contest-ward-allow");
    await expect(
      createLevel(wardCollation(WARD_COORD, "contest-ward-allow")),
    ).resolves.toBeUndefined();
  });

  it("denies a ward coordinator an EC8B for another ward", async () => {
    await expect(
      createLevel(wardCollation(WARD_COORD, "contest-ward-allow", WARD_02)),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("lets an LGA coordinator create EC8B for any ward in their LGA", async () => {
    await useContest("contest-lga-ward");
    await expect(
      createLevel(wardCollation(LGA_COORD, "contest-lga-ward", WARD_02)),
    ).resolves.toBeUndefined();
  });

  it("lets an LGA coordinator create EC8C for their own LGA", async () => {
    await expect(
      createLevel(lgaCollation(LGA_COORD, "contest-lga-ward")),
    ).resolves.toBeUndefined();
  });

  it("lets a zone coordinator create EC8C for an LGA in their zone", async () => {
    await useContest("contest-zone-lga");
    await expect(
      createLevel(lgaCollation(ZONE_COORD, "contest-zone-lga")),
    ).resolves.toBeUndefined();
  });

  it("lets a state coordinator create EC8C for any LGA in scope", async () => {
    await useContest("contest-state-lga");
    await expect(
      createLevel(lgaCollation(STATE_COORD, "contest-state-lga")),
    ).resolves.toBeUndefined();
  });

  it("denies a ward coordinator an EC8C (no LGA grant)", async () => {
    await useContest("contest-ward-lga-denied");
    await expect(
      createLevel(lgaCollation(WARD_COORD, "contest-ward-lga-denied")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("denies an LGA coordinator the LGA-level create for another LGA", async () => {
    await expect(
      createLevel(
        lgaCollation(LGA_COORD, "contest-ward-lga-denied", OUTSIDE_LGA),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("lets a state coordinator create EC8D for a state-wide contest", async () => {
    await useContest("contest-state-collation", {
      scope_type: "state",
      scope_id: STATE,
      lga_ids: [LGA],
    });

    await expect(
      createLevel(stateCollation(STATE_COORD, "contest-state-collation")),
    ).resolves.toBeUndefined();
  });

  it("denies an LGA coordinator the EC8D create", async () => {
    await expect(
      createLevel(stateCollation(LGA_COORD, "contest-state-collation")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("denies EC8D for a non-state contest even with a global grant", async () => {
    await useContest("contest-not-state");
    await expect(
      createLevel(stateCollation(STATE_COORD, "contest-not-state")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("lets an election officer create all four levels in contest scope", async () => {
    await useContest("contest-officer-all", {
      scope_type: "state",
      scope_id: STATE,
      lga_ids: [LGA],
    });

    await expect(
      createLevel({
        uid: OFFICER,
        contestId: "contest-officer-all",
        level: "polling_unit",
        pollingUnitId: "nkanu-west-ward-01-pu-001",
        wardId: WARD_01,
        lgaId: LGA,
      }),
    ).resolves.toBeUndefined();

    await expect(
      createLevel(wardCollation(OFFICER, "contest-officer-all")),
    ).resolves.toBeUndefined();

    await expect(
      createLevel(lgaCollation(OFFICER, "contest-officer-all")),
    ).resolves.toBeUndefined();

    await expect(
      createLevel(stateCollation(OFFICER, "contest-officer-all")),
    ).resolves.toBeUndefined();
  });

  it("lets an admin create all four levels in contest scope", async () => {
    await useContest("contest-admin-all", {
      scope_type: "state",
      scope_id: STATE,
      lga_ids: [LGA],
    });

    await expect(
      createLevel({
        uid: ADMIN,
        contestId: "contest-admin-all",
        level: "polling_unit",
        pollingUnitId: "nkanu-west-ward-01-pu-002",
        wardId: WARD_01,
        lgaId: LGA,
      }),
    ).resolves.toBeUndefined();

    await expect(
      createLevel(wardCollation(ADMIN, "contest-admin-all", WARD_02)),
    ).resolves.toBeUndefined();

    await expect(
      createLevel(lgaCollation(ADMIN, "contest-admin-all")),
    ).resolves.toBeUndefined();

    await expect(
      createLevel(stateCollation(ADMIN, "contest-admin-all")),
    ).resolves.toBeUndefined();
  });

  it("denies a plain member every collation level", async () => {
    await useContest("contest-member-denied");

    await expect(
      createLevel(wardCollation(MEMBER, "contest-member-denied")),
    ).rejects.toMatchObject({ code: "permission-denied" });

    await expect(
      createLevel(lgaCollation(MEMBER, "contest-member-denied")),
    ).rejects.toMatchObject({ code: "permission-denied" });

    await useContest("contest-member-denied-state", {
      scope_type: "state",
      scope_id: STATE,
      lga_ids: [LGA],
    });

    await expect(
      createLevel(stateCollation(MEMBER, "contest-member-denied-state")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects a duplicate EC8B for the same ward (deterministic ID)", async () => {
    await useContest("contest-ward-allow");
    await expect(
      createLevel(wardCollation(LGA_COORD, "contest-ward-allow")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects a duplicate EC8C for the same LGA", async () => {
    await useContest("contest-state-lga");
    await expect(
      createLevel(lgaCollation(STATE_COORD, "contest-state-lga")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects a duplicate EC8D for the same state", async () => {
    await useContest("contest-state-collation", {
      scope_type: "state",
      scope_id: STATE,
      lga_ids: [LGA],
    });
    await expect(
      createLevel(stateCollation(STATE_COORD, "contest-state-collation")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("keeps legacy PU documents (no result_level) readable and updatable", async () => {
    const legacyContest = "contest-legacy-pu";
    await useContest(legacyContest);

    const legacyId = await seedElectionResult({
      contestId: legacyContest,
      pollingUnitId: "nkanu-west-ward-01-pu-003",
      wardId: WARD_01,
      submittedBy: MEMBER,
      status: "submitted",
    });

    const officerClient = authAs(OFFICER);
    const snapshot = await getDoc(
      doc(officerClient, "election_results", legacyId),
    );

    expect(snapshot.exists()).toBe(true);
    expect(snapshot.data()?.result_level).toBeUndefined();

    await expect(
      updateDoc(doc(officerClient, "election_results", legacyId), {
        status: "approved",
        verified: true,
        reviewed_by: OFFICER,
        reviewed_at: new Date(),
        history: [],
        updated_at: new Date(),
      }),
    ).resolves.toBeUndefined();

    const approved = await getDoc(
      doc(officerClient, "election_results", legacyId),
    );
    expect(approved.data()?.status).toBe("approved");
  });

  it("lets an LGA coordinator run the ward+LGA duplicate pre-check", async () => {
    const client = authAs(LGA_COORD);
    const rows = await getElectionResultsByWardAndLga(
      WARD_01,
      LGA,
      client,
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.some((row) => row.id === "contest-ward-allow__ward__" + WARD_01),
    ).toBe(true);
  });
});
