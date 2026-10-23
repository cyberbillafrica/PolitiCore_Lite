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
  seedAssignment,
  seedBaselineAccess,
  seedCoordinatorAccess,
  seedUser,
} from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

const ids = {
  direct: "assignment-direct",
  legacy: "assignment-legacy",
  created: "assignment-created",
  legacyCreator: "assignment-legacy-creator",
  puTarget: "assignment-pu-target",
  ownWardTarget: "assignment-own-ward",
  otherWardTarget: "assignment-other-ward",
  someoneElse: "assignment-someone-else",
};

function scopeQuery(db: Firestore, type: string, id: string) {
  return getDocs(
    query(
      collection(db, "campaign_assignments"),
      where("scope_type", "==", type),
      where("scope_id", "==", id),
    ),
  );
}

function wardTargetQuery(db: Firestore, wardId: string) {
  return getDocs(
    query(
      collection(db, "campaign_assignments"),
      where("target_ward_id", "in", [wardId]),
    ),
  );
}

function assignedQuery(db: Firestore, field: "assigned_to_user" | "assigned_to" | "created_by" | "assigned_by", uid: string) {
  return getDocs(
    query(collection(db, "campaign_assignments"), where(field, "==", uid)),
  );
}

describe("campaign_assignments reads", () => {
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

    await seedAssignment({
      id: ids.direct,
      assigned_to_user: "chika",
      created_by: "ward-coord",
      target_ward_id: WARD_01,
    });

    await seedAssignment({
      id: ids.legacy,
      created_by: "ward-coord",
      target_ward_id: WARD_01,
      /* pre-Round-5 shape: assigned_to only */
      assigned_to_user: null,
      assigned_to: "chika",
    });

    await seedAssignment({ id: ids.created, created_by: "chika" });
    await seedAssignment({ id: ids.legacyCreator, created_by: "chika" });

    await seedAssignment({
      id: ids.puTarget,
      created_by: "ward-coord",
      scope_type: "polling_unit",
      scope_id: PU_001,
      target_ward_id: WARD_01,
    });

    await seedAssignment({
      id: ids.ownWardTarget,
      created_by: "ward-coord",
      scope_type: "ward",
      scope_id: WARD_01,
      target_ward_id: WARD_01,
    });

    await seedAssignment({
      id: ids.otherWardTarget,
      created_by: "ward-coord",
      scope_type: "ward",
      scope_id: OTHER_WARD,
      target_ward_id: OTHER_WARD,
    });

    await seedAssignment({ id: ids.someoneElse, assigned_to_user: "ward-coord" });
  });

  /* ---------------- plain member ---------------- */

  it("reads an assignment addressed to them (Round 5 field)", async () => {
    const snapshot = await assertSucceeds(
      assignedQuery(authAs("chika"), "assigned_to_user", "chika"),
    );

    expect(snapshot.docs.map((item) => item.id)).toContain(ids.direct);
  });

  it("reads an assignment addressed to them through the legacy field", async () => {
    await assertSucceeds(assignedQuery(authAs("chika"), "assigned_to", "chika"));
  });

  it("reads assignments they created", async () => {
    const snapshot = await assertSucceeds(
      assignedQuery(authAs("chika"), "created_by", "chika"),
    );

    expect(snapshot.docs.map((item) => item.id).sort()).toEqual(
      [ids.created, ids.legacyCreator].sort(),
    );
  });

  it("reads assignments they created through the legacy field", async () => {
    await assertSucceeds(assignedQuery(authAs("chika"), "assigned_by", "chika"));
  });

  it("reads a PU-targeted assignment for their own polling unit", async () => {
    const snapshot = await assertSucceeds(
      scopeQuery(authAs("chika"), "polling_unit", PU_001),
    );

    expect(snapshot.docs.map((item) => item.id)).toEqual([ids.puTarget]);
  });

  it("cannot read a ward-targeted assignment (no ward grant)", async () => {
    await assertFails(wardTargetQuery(authAs("chika"), WARD_01));
  });

  it("cannot read someone else's assignment", async () => {
    await assertFails(
      assignedQuery(authAs("chika"), "assigned_to_user", "ward-coord"),
    );
  });

  it("cannot run an unfiltered list read", async () => {
    await assertFails(
      getDocs(query(collection(authAs("chika"), "campaign_assignments"))),
    );
  });

  /* ---------------- coordinators ---------------- */

  it("a ward coordinator reads ward-stamped assignments in their ward", async () => {
    const snapshot = await assertSucceeds(
      wardTargetQuery(authAs("ward-coord"), WARD_01),
    );

    expect(snapshot.docs.map((item) => item.id)).toContain(ids.ownWardTarget);
  });

  it("a ward coordinator reads ward-scoped assignments at their scope", async () => {
    await assertSucceeds(scopeQuery(authAs("ward-coord"), "ward", WARD_01));
  });

  it("a ward coordinator cannot read another ward's assignments", async () => {
    await assertFails(wardTargetQuery(authAs("ward-coord"), OTHER_WARD));
  });

  it("an LGA coordinator reads assignments in every ward of the LGA", async () => {
    await assertSucceeds(wardTargetQuery(authAs("lga-coord"), WARD_02));
  });

  /* ---------------- role boundaries ---------------- */

  it("an election officer cannot read assignments", async () => {
    await assertFails(
      getDocs(query(collection(authAs("officer"), "campaign_assignments"))),
    );
  });

  it("a social-only member cannot read assignments", async () => {
    await assertFails(
      getDocs(query(collection(authAs("social"), "campaign_assignments"))),
    );
  });

  it("an admin reads the collection unfiltered", async () => {
    const snapshot = await assertSucceeds(
      getDocs(query(collection(authAs("admin"), "campaign_assignments"))),
    );

    expect(snapshot.size).toBe(Object.keys(ids).length);
  });

  it("a signed-out client cannot read assignments", async () => {
    await assertFails(
      getDocs(query(collection(anonDb(), "campaign_assignments"))),
    );
  });
});
