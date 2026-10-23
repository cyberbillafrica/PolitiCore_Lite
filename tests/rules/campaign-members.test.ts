import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  LGA,
  OTHER_LGA,
  OTHER_PU,
  OTHER_WARD,
  PU_001,
  WARD_01,
  WARD_02,
  ZONE,
  anonDb,
  authAs,
  seedBaselineAccess,
  seedCoordinatorAccess,
  seedUser,
} from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

function membersByWard(db: Firestore, wardIds: string[]) {
  return getDocs(
    query(
      collection(db, "users"),
      where("membership_types", "array-contains", "campaign_member"),
      where("ward_id", "in", wardIds),
    ),
  );
}

function membersByPu(db: Firestore, puId: string) {
  return getDocs(
    query(
      collection(db, "users"),
      where("membership_types", "array-contains", "campaign_member"),
      where("polling_unit_id", "==", puId),
    ),
  );
}

describe("campaign member directory queries", () => {
  beforeAll(async () => {
    await initTestEnv();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  beforeEach(async () => {
    await clearDb();

    await seedUser("chika", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
      full_name: "Chika",
    });
    await seedBaselineAccess("chika", PU_001, WARD_01, LGA, ZONE);

    await seedUser("ward-colleague", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
      full_name: "Ward Colleague",
    });

    await seedUser("ward-two-member", {
      ward_id: WARD_02,
      polling_unit_id: "nkanu-west-ward-02-pu-001",
      lga_id: LGA,
      full_name: "Ward Two",
    });

    await seedUser("other-lga-member", {
      ward_id: OTHER_WARD,
      polling_unit_id: OTHER_PU,
      lga_id: OTHER_LGA,
      full_name: "Other LGA",
    });

    await seedUser("ward-coord", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedBaselineAccess("ward-coord", PU_001, WARD_01, LGA, ZONE);
    await seedCoordinatorAccess("ward-coord", "ward", WARD_01);

    await seedUser("social", {
      membership_types: ["social_member"],
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
  });

  it("a member lists campaign members at their own polling unit", async () => {
    const snapshot = await assertSucceeds(membersByPu(authAs("chika"), PU_001));

    expect(snapshot.docs.map((item) => item.id).sort()).toEqual(
      ["chika", "ward-coord", "ward-colleague"].sort(),
    );
  });

  it("a ward coordinator lists members across the ward", async () => {
    const snapshot = await assertSucceeds(
      membersByWard(authAs("ward-coord"), [WARD_01]),
    );

    expect(snapshot.docs.map((item) => item.id)).not.toContain(
      "other-lga-member",
    );
  });

  it("the query itself never returns another ward's members", async () => {
    const snapshot = await assertSucceeds(
      membersByWard(authAs("chika"), [WARD_01]),
    );

    expect(snapshot.docs.map((item) => item.id)).not.toContain(
      "ward-two-member",
    );
  });

  it("a signed-out client cannot read the directory", async () => {
    await assertFails(membersByPu(anonDb(), PU_001));
  });

  /*
   * The `users` collection is readable by ANY signed-in account
   * (`firestore.rules` — `allow read: if isSignedIn()`). The directory
   * therefore relies on the QUERY for scoping, not on the rules. This
   * test pins the current behaviour so a future rules tightening is a
   * deliberate, visible change rather than a silent break.
   */
  it("a social-only member can still read profile documents (rules allow any signed-in reader)", async () => {
    const snapshot = await assertSucceeds(
      membersByWard(authAs("social"), [WARD_01]),
    );

    expect(snapshot.docs.map((item) => item.id)).toEqual(
      expect.arrayContaining(["chika"]),
    );
  });
});
