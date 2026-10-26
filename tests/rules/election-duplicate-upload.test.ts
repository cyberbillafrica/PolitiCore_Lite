import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doc, getDoc, setDoc } from "firebase/firestore";

import {
  CONTEST_ID,
  WARD_01_PUS,
  resultPayload,
  seedContest,
  seedElectionGrants,
  seedElectionResult,
  seedElectionSettings,
} from "./election-helpers";
import { authAs, seedUser } from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * A second upload for a polling unit that already has a result is
 * denied by `!exists(election_results/{resultId})`. The form is now
 * replaced by the "already submitted" card, so the member never fills
 * it and never sees the raw permission error.
 */

const MEMBER = "duplicate-member";
const OTHER_SUBMITTER = "duplicate-original-submitter";
const PU = WARD_01_PUS[0];

describe("election result — duplicate submission", () => {
  beforeAll(async () => {
    await initTestEnv();
    await clearDb();

    await seedUser(MEMBER, {
      ward_id: "nkanu-west-ward-01",
      polling_unit_id: PU,
      lga_id: "nkanu-west",
    });

    await seedElectionSettings();
    await seedContest();

    /* The member holds the new coordinator upload grant, so the ONLY
     * reason the create can fail is the existing document. */
    await seedElectionGrants(MEMBER, [
      ["upload_election_result", "ward", "nkanu-west-ward-01"],
      ["view_election_results", "ward", "nkanu-west-ward-01"],
    ]);

    await seedElectionResult({
      pollingUnitId: PU,
      submittedBy: OTHER_SUBMITTER,
    });
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  it("denies a second create for the same contest + polling unit", async () => {
    const ref = doc(
      authAs(MEMBER),
      "election_results",
      `${CONTEST_ID}__${PU}`,
    );

    await expect(
      setDoc(
        ref,
        resultPayload({
          pollingUnitId: PU,
          submittedBy: MEMBER,
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("keeps the original submitter and payload untouched", async () => {
    const snap = await getDoc(
      doc(
        authAs(MEMBER),
        "election_results",
        `${CONTEST_ID}__${PU}`,
      ),
    );

    expect(snap.exists()).toBe(true);
    expect(snap.data()?.submitted_by).toBe(OTHER_SUBMITTER);
    expect(snap.data()?.results).toEqual([
      { party: "apc", votes: 10 },
      { party: "pdp", votes: 20 },
    ]);
  });
});
