import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, getDocs, query, where } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  LGA,
  PU_001,
  WARD_01,
  WARD_02,
  ZONE,
  authAs,
  seedActivity,
  seedBaselineAccess,
  seedUser,
} from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * ============================================================
 * SMOKE TEST — REPRODUCES THE PRODUCTION BUG
 * ============================================================
 *
 * Chika is a plain campaign member with a complete baseline
 * projection. The rules and the data are correct; the CLIENT QUERY is
 * not. `getDocs(collection(db, "campaign_activities"))` asks for the
 * whole collection, so Firestore must prove the rules allow every
 * document, and the first activity outside her scope fails the whole
 * query with "Missing or insufficient permissions".
 *
 * This file is the regression that fails before the Phase C fix and
 * stays as the proof the unfiltered query is never reintroduced.
 */

describe("campaign activities — unfiltered read", () => {
  beforeAll(async () => {
    await initTestEnv();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  beforeEach(async () => {
    await clearDb();

    await seedUser("chika", {
      access_role: "member",
      membership_types: ["campaign_member"],
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
      full_name: "Chika",
    });

    await seedBaselineAccess("chika", PU_001, WARD_01, LGA, ZONE);

    /* One activity in her ward… */
    await seedActivity({
      id: "chika-ward-activity",
      scope_type: "ward",
      scope_id: WARD_01,
      scope_chain: ["enugu-state", ZONE, LGA, WARD_01],
      scope_ward_id: WARD_01,
    });

    /* …and one outside it. */
    await seedActivity({
      id: "other-ward-activity",
      scope_type: "ward",
      scope_id: WARD_02,
      scope_chain: ["enugu-state", ZONE, LGA, WARD_02],
      scope_ward_id: WARD_02,
    });
  });

  it("fails the whole query when it is unfiltered, even though the user has grants", async () => {
    const db = authAs("chika");

    await assertFails(
      getDocs(query(collection(db, "campaign_activities"))),
    );
  });

  it("reports a permission failure, not an empty result", async () => {
    const db = authAs("chika");

    const result = await getDocs(
      query(collection(db, "campaign_activities")),
    ).catch((error: unknown) => error);

    expect(result).toBeInstanceOf(Error);

    /*
     * The client SDK reports "Missing or insufficient permissions".
     * The emulator (with debug messages on) attaches the rules trace —
     * "evaluation error … Property scope_type is undefined" — because
     * an unfiltered list leaves the field the rule reads unknown.
     * Both are the same failure.
     */
    expect(String((result as Error).message)).toMatch(
      /missing or insufficient permissions|evaluation error/i,
    );
  });

  it("succeeds when the query is narrowed to a scope the user holds", async () => {
    const db = authAs("chika");

    await assertSucceeds(
      getDocs(
        query(
          collection(db, "campaign_activities"),
          where("scope_type", "==", "ward"),
          where("scope_id", "==", WARD_01),
        ),
      ),
    );
  });
});
