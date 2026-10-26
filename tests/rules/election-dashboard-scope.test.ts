import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { collection, getDocs, query, where } from "firebase/firestore";

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
 * The contest dashboard narrows its listener to the viewer's assignment
 * (plus the contest). This asserts the exact query shape a ward
 * coordinator's dashboard opens: `ward_id == <their ward>` succeeds and
 * returns ONLY their ward, while the contest-wide read is denied.
 */

const WARD_COORD = "dashboard-ward-coord";

describe("election dashboard — ward coordinator query scope", () => {
  beforeAll(async () => {
    await initTestEnv();
    await clearDb();

    await seedUser(WARD_COORD, {
      ward_id: WARD_01,
      polling_unit_id: WARD_01_PUS[0],
      lga_id: "nkanu-west",
    });

    await seedElectionSettings();
    await seedContest();

    await seedElectionGrants(WARD_COORD, [
      ["view_election_results", "ward", WARD_01],
    ]);

    for (const pollingUnitId of WARD_01_PUS.slice(0, 2)) {
      await seedElectionResult({
        pollingUnitId,
        submittedBy: WARD_COORD,
      });
    }

    await seedElectionResult({
      wardId: WARD_02,
      pollingUnitId: WARD_02_PU,
      submittedBy: "other-ward-submitter",
    });
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  it("opens only the coordinator's ward query and returns only its rows", async () => {
    const db = authAs(WARD_COORD);

    const snapshot = await getDocs(
      query(
        collection(db, "election_results"),
        where("ward_id", "==", WARD_01),
      ),
    );

    expect(snapshot.size).toBe(2);
    expect(
      snapshot.docs.every((document) => document.get("ward_id") === WARD_01),
    ).toBe(true);
  });

  it("denies the contest-wide read the admin dashboard uses", async () => {
    const db = authAs(WARD_COORD);

    await expect(
      getDocs(collection(db, "election_results")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("denies another ward's query", async () => {
    const db = authAs(WARD_COORD);

    await expect(
      getDocs(
        query(
          collection(db, "election_results"),
          where("ward_id", "==", WARD_02),
        ),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
