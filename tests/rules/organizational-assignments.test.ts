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
  OTHER_WARD,
  PU_001,
  WARD_01,
  WARD_02,
  ZONE,
  anonDb,
  authAs,
  seedBaselineAccess,
  seedCoordinatorAccess,
  seedOrganizationalAssignment,
  seedUser,
} from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

const ids = {
  own: "org-own",
  wardColleague: "org-ward-colleague",
  puColleague: "org-pu-colleague",
  otherWard: "org-other-ward",
};

function byScope(db: Firestore, type: string, id: string) {
  return getDocs(
    query(
      collection(db, "organizational_assignments"),
      where("scope_type", "==", type),
      where("scope_id", "==", id),
      where("status", "==", "active"),
    ),
  );
}

describe("organizational_assignments reads", () => {
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
    });
    await seedBaselineAccess("chika", PU_001, WARD_01, LGA, ZONE);

    await seedUser("ward-coord", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedBaselineAccess("ward-coord", PU_001, WARD_01, LGA, ZONE);
    await seedCoordinatorAccess("ward-coord", "ward", WARD_01);

    await seedUser("lga-coord", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedBaselineAccess("lga-coord", PU_001, WARD_01, LGA, ZONE);
    await seedCoordinatorAccess("lga-coord", "lga", LGA);
    await seedCoordinatorAccess("lga-coord", "ward", WARD_01);
    await seedCoordinatorAccess("lga-coord", "ward", WARD_02);

    await seedUser("admin", { access_role: "admin" });
    await seedUser("officer", { access_role: "election_officer" });
    await seedUser("social", { membership_types: ["social_member"] });

    await seedOrganizationalAssignment({
      id: ids.own,
      user_id: "chika",
      position: "campaign_member",
      scope_type: "polling_unit",
      scope_id: PU_001,
    });

    await seedOrganizationalAssignment({
      id: ids.wardColleague,
      user_id: "ward-coord",
      scope_type: "ward",
      scope_id: WARD_01,
    });

    await seedOrganizationalAssignment({
      id: ids.puColleague,
      user_id: "other-member",
      position: "pu_coordinator",
      scope_type: "polling_unit",
      scope_id: PU_001,
    });

    await seedOrganizationalAssignment({
      id: ids.otherWard,
      user_id: "other-member",
      scope_type: "ward",
      scope_id: OTHER_WARD,
    });
  });

  it("a member reads their own assignment record", async () => {
    const snapshot = await assertSucceeds(
      getDocs(
        query(
          collection(authAs("chika"), "organizational_assignments"),
          where("user_id", "==", "chika"),
        ),
      ),
    );

    expect(snapshot.docs.map((item) => item.id)).toEqual([ids.own]);
  });

  it("a member cannot read another member's assignment", async () => {
    await assertFails(
      getDocs(
        query(
          collection(authAs("chika"), "organizational_assignments"),
          where("user_id", "==", "ward-coord"),
        ),
      ),
    );
  });

  it("a member can resolve positions at their own PU (Members page)", async () => {
    const snapshot = await assertSucceeds(
      byScope(authAs("chika"), "polling_unit", PU_001),
    );

    expect(snapshot.docs.map((item) => item.id).sort()).toEqual(
      [ids.own, ids.puColleague].sort(),
    );
  });

  it("a ward coordinator reads positions at their ward", async () => {
    await assertSucceeds(byScope(authAs("ward-coord"), "ward", WARD_01));
  });

  it("a ward coordinator cannot read positions in another ward", async () => {
    await assertFails(byScope(authAs("ward-coord"), "ward", OTHER_WARD));
  });

  it("an LGA coordinator reads positions in every ward of the LGA", async () => {
    await assertSucceeds(byScope(authAs("lga-coord"), "ward", WARD_02));
  });

  it("an admin reads every position unfiltered", async () => {
    const snapshot = await assertSucceeds(
      getDocs(query(collection(authAs("admin"), "organizational_assignments"))),
    );

    expect(snapshot.size).toBe(4);
  });

  it("an election officer cannot read positions", async () => {
    await assertFails(
      getDocs(
        query(collection(authAs("officer"), "organizational_assignments")),
      ),
    );
  });

  it("a social-only member cannot read another member's position", async () => {
    await assertFails(
      getDocs(
        query(
          collection(authAs("social"), "organizational_assignments"),
          where("user_id", "==", "ward-coord"),
        ),
      ),
    );
  });

  it("a signed-out client cannot read positions", async () => {
    await assertFails(
      getDocs(query(collection(anonDb(), "organizational_assignments"))),
    );
  });
});
