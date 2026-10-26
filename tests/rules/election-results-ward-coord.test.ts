import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getElectionResultsByWard } from "@/lib/firebase/firestore";

import {
  WARD_01,
  WARD_01_PUS,
  WARD_02,
  WARD_02_PU,
  seedContest,
  seedElectionGrants,
  seedElectionResult,
  seedElectionSettings,
} from "./election-helpers";
import { authAs, seedUser } from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * Round 10 regression: a ward coordinator's results page was empty
 * because `where(ward_id) + orderBy(created_at)` required a composite
 * index production never had, and the FAILED_PRECONDITION surfaced as
 * "This action can't be completed right now". The scoped readers now
 * fetch and sort in memory.
 */

const WARD_COORD = "results-ward-coord";
const OTHER_WARD_COORD = "results-other-ward-coord";

describe("election results — ward coordinator reads their ward", () => {
  beforeAll(async () => {
    await initTestEnv();
    await clearDb();

    await seedUser(WARD_COORD, {
      ward_id: WARD_01,
      polling_unit_id: WARD_01_PUS[0],
      lga_id: "nkanu-west",
    });

    await seedUser(OTHER_WARD_COORD, {
      ward_id: WARD_02,
      polling_unit_id: WARD_02_PU,
      lga_id: "nkanu-west",
    });

    await seedElectionSettings();
    await seedContest();

    await seedElectionGrants(WARD_COORD, [
      ["view_election_results", "ward", WARD_01],
    ]);
    await seedElectionGrants(OTHER_WARD_COORD, [
      ["view_election_results", "ward", WARD_02],
    ]);

    for (const [index, pollingUnitId] of WARD_01_PUS.entries()) {
      await seedElectionResult({
        pollingUnitId,
        submittedBy: `submitter-${index}`,
        createdAt: new Date(2026, 9, 20 + index, 9, 0, 0),
      });
    }

    /* Out of scope for the ward-01 coordinator. */
    await seedElectionResult({
      wardId: WARD_02,
      pollingUnitId: WARD_02_PU,
      submittedBy: "other-ward-submitter",
    });
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  it("returns all four results in the ward with no permission error", async () => {
    const results = await getElectionResultsByWard(
      WARD_01,
      authAs(WARD_COORD),
    );

    expect(results).toHaveLength(4);
    expect(results.map((result) => result.polling_unit_id).sort()).toEqual(
      [...WARD_01_PUS].sort(),
    );
  });

  it("orders the rows newest first without a composite index", async () => {
    const results = await getElectionResultsByWard(
      WARD_01,
      authAs(WARD_COORD),
    );

    const ids = results.map((result) => result.polling_unit_id);
    expect(ids[0]).toBe(WARD_01_PUS[3]);
    expect(ids[ids.length - 1]).toBe(WARD_01_PUS[0]);
  });

  it("still denies another ward's query", async () => {
    await expect(
      getElectionResultsByWard(WARD_02, authAs(WARD_COORD)),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("gives the other ward coordinator only their own ward", async () => {
    const results = await getElectionResultsByWard(
      WARD_02,
      authAs(OTHER_WARD_COORD),
    );

    expect(results).toHaveLength(1);
    expect(results[0].ward_id).toBe(WARD_02);
  });
});
