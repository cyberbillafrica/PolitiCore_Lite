import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  LGA,
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
  seedIssue,
  seedUser,
} from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

const ids = {
  mine: "issue-mine",
  anotherMember: "issue-another-member",
  ward: "issue-ward",
  puInWard: "issue-pu-in-ward",
  puOtherWard: "issue-pu-other-ward",
  otherWard: "issue-other-ward",
};

function issueCreate(db: Firestore, overrides: Record<string, unknown> = {}) {
  return addDoc(collection(db, "issues"), {
    title: "Broken signpost",
    description: "The signpost at the junction is missing.",
    reported_by: "chika",
    raised_by: "chika",
    status: "reported",
    scope_type: "polling_unit",
    scope_level: "polling_unit",
    scope_id: PU_001,
    scope_ward_id: WARD_01,
    ...overrides,
  });
}

describe("issues reads", () => {
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

    await seedUser("other-member", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });

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

    await seedIssue({
      id: ids.mine,
      raised_by: "chika",
      scope_level: "polling_unit",
      scope_id: PU_001,
      scope_ward_id: WARD_01,
    });

    await seedIssue({
      id: ids.anotherMember,
      raised_by: "other-member",
      scope_level: "polling_unit",
      scope_id: PU_001,
      scope_ward_id: WARD_01,
    });

    await seedIssue({
      id: ids.ward,
      raised_by: "other-member",
      scope_level: "ward",
      scope_id: WARD_01,
      scope_ward_id: WARD_01,
    });

    await seedIssue({
      id: ids.puInWard,
      raised_by: "other-member",
      scope_level: "polling_unit",
      scope_id: PU_001,
      scope_ward_id: WARD_01,
    });

    await seedIssue({
      id: ids.puOtherWard,
      raised_by: "other-member",
      scope_level: "polling_unit",
      scope_id: OTHER_PU,
      scope_ward_id: WARD_02,
    });

    await seedIssue({
      id: ids.otherWard,
      raised_by: "other-member",
      scope_level: "ward",
      scope_id: OTHER_WARD,
      scope_ward_id: OTHER_WARD,
    });
  });

  it("a member reads the issue they raised", async () => {
    const snapshot = await assertSucceeds(
      getDocs(
        query(collection(authAs("chika"), "issues"), where("raised_by", "==", "chika")),
      ),
    );

    expect(snapshot.docs.map((item) => item.id)).toEqual([ids.mine]);
  });

  it("a member cannot read another member's issue at the same PU", async () => {
    await assertFails(
      getDocs(
        query(
          collection(authAs("chika"), "issues"),
          where("raised_by", "==", "other-member"),
        ),
      ),
    );
  });

  it("a ward coordinator reads issues at their ward", async () => {
    const snapshot = await assertSucceeds(
      getDocs(
        query(
          collection(authAs("ward-coord"), "issues"),
          where("scope_type", "==", "ward"),
          where("scope_id", "==", WARD_01),
        ),
      ),
    );

    expect(snapshot.docs.map((item) => item.id)).toEqual([ids.ward]);
  });

  it("a ward coordinator reads PU issues stamped to their ward", async () => {
    const snapshot = await assertSucceeds(
      getDocs(
        query(
          collection(authAs("ward-coord"), "issues"),
          where("scope_ward_id", "in", [WARD_01]),
        ),
      ),
    );

    expect(snapshot.docs.map((item) => item.id).sort()).toEqual(
      [ids.mine, ids.anotherMember, ids.ward, ids.puInWard].sort(),
    );
  });

  it("a ward coordinator cannot read issues stamped to another ward", async () => {
    await assertFails(
      getDocs(
        query(
          collection(authAs("ward-coord"), "issues"),
          where("scope_ward_id", "in", [WARD_02]),
        ),
      ),
    );
  });

  it("an LGA coordinator reads issues in every ward of the LGA", async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(authAs("lga-coord"), "issues"),
          where("scope_ward_id", "in", [WARD_02]),
        ),
      ),
    );
  });

  it("a member raises an issue at their own polling unit", async () => {
    await assertSucceeds(issueCreate(authAs("chika")));
  });

  it("a member cannot raise an issue at another polling unit", async () => {
    await assertFails(
      issueCreate(authAs("chika"), {
        scope_id: OTHER_PU,
        scope_ward_id: OTHER_WARD,
      }),
    );
  });

  it("an admin reads every issue unfiltered", async () => {
    const snapshot = await assertSucceeds(
      getDocs(query(collection(authAs("admin"), "issues"))),
    );

    expect(snapshot.size).toBe(6);
  });

  it("an election officer cannot read issues", async () => {
    await assertFails(getDocs(query(collection(authAs("officer"), "issues"))));
  });

  it("a social-only member cannot read another member's issue", async () => {
    await assertFails(
      getDocs(
        query(
          collection(authAs("social"), "issues"),
          where("raised_by", "==", "other-member"),
        ),
      ),
    );
  });

  it("a signed-out client cannot read issues", async () => {
    await assertFails(getDocs(query(collection(anonDb(), "issues"))));
  });
});
