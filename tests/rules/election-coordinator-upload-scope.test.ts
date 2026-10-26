import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doc, setDoc } from "firebase/firestore";

import {
  CONTEST_ID,
  WARD_01,
  WARD_01_PUS,
  WARD_02,
  WARD_02_PU,
  resultPayload,
  seedContest,
  seedElectionGrants,
  seedElectionResult,
  seedElectionSettings,
} from "./election-helpers";
import { authAs, seedUser } from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * Round 10 upload scope:
 *
 *   ward coordinator   -> any PU in their ward
 *   state coordinator  -> any PU in the state, contest still bounds
 *   PU coordinator     -> own PU only (Chika's path, unchanged)
 *
 * The active-contest restriction is asserted explicitly so a later
 * change cannot loosen it for a state coordinator.
 */

const WARD_COORD = "upload-ward-coord";
const STATE_COORD = "upload-state-coord";
const PU_COORD = "upload-pu-coord";

const OUTSIDE_LGA = "nsukka";
const OUTSIDE_WARD = "nsukka-ward-01";
const OUTSIDE_PU = "nsukka-ward-01-pu-001";

async function createResult(uid: string, pollingUnitId: string, wardId = WARD_01, lgaId = "nkanu-west") {
  const client = authAs(uid);
  const ref = doc(client, "election_results", `${CONTEST_ID}__${pollingUnitId}`);

  await setDoc(
    ref,
    resultPayload({
      pollingUnitId,
      wardId,
      lgaId,
      submittedBy: uid,
    }),
  );
}

describe("election result upload — coordinator scope", () => {
  beforeAll(async () => {
    await initTestEnv();
    await clearDb();

    await seedElectionSettings();
    await seedContest();

    /*
     * The ward coordinator lives in ward 02 but is assigned to ward 01:
     * their right to upload for ward 01 must come from the assignment
     * grant, not from their own registration.
     */
    await seedUser(WARD_COORD, {
      ward_id: WARD_02,
      polling_unit_id: WARD_02_PU,
      lga_id: "nkanu-west",
    });
    await seedElectionGrants(WARD_COORD, [
      ["upload_election_result", "ward", WARD_01],
    ]);

    await seedUser(STATE_COORD, {
      ward_id: WARD_01,
      polling_unit_id: WARD_01_PUS[0],
      lga_id: "nkanu-west",
    });
    await seedElectionGrants(STATE_COORD, [
      ["upload_election_result", "global", ""],
    ]);

    await seedUser(PU_COORD, {
      ward_id: WARD_01,
      polling_unit_id: WARD_01_PUS[0],
      lga_id: "nkanu-west",
    });

    /* An existing result for the PU coordinator's own unit is not
     * needed; their create is the first one. */
    await seedElectionResult({
      pollingUnitId: WARD_02_PU,
      submittedBy: "someone-else",
      wardId: WARD_02,
    });
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  it("lets a ward coordinator upload for a different PU in their ward", async () => {
    await expect(
      createResult(WARD_COORD, WARD_01_PUS[1]),
    ).resolves.toBeUndefined();
  });

  it("denies a ward coordinator uploading for another ward", async () => {
    await expect(
      createResult(WARD_COORD, "nkanu-west-ward-03-pu-001", "nkanu-west-ward-03"),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("lets a state coordinator upload inside the active contest", async () => {
    await expect(
      createResult(STATE_COORD, WARD_01_PUS[2]),
    ).resolves.toBeUndefined();
  });

  it("keeps the active-contest restriction for a state coordinator", async () => {
    await expect(
      createResult(STATE_COORD, OUTSIDE_PU, OUTSIDE_WARD, OUTSIDE_LGA),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("keeps a PU coordinator on their own polling unit", async () => {
    await expect(
      createResult(PU_COORD, WARD_01_PUS[0]),
    ).resolves.toBeUndefined();

    await expect(
      createResult(PU_COORD, WARD_01_PUS[3]),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
