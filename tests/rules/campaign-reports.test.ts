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
  PU_001,
  WARD_01,
  ZONE,
  anonDb,
  authAs,
  seedBaselineAccess,
  seedReport,
  seedUser,
} from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

const ids = {
  mine: "report-mine",
  againstMyAssignment: "report-against-my-assignment",
  someoneElse: "report-someone-else",
};

function reportCreate(
  db: Firestore,
  overrides: Record<string, unknown> = {},
) {
  return addDoc(collection(db, "campaign_field_reports"), {
    assignment_id: "assignment-1",
    assignment_creator_id: "ward-coord",
    submitted_by: "chika",
    submitted_at: new Date(),
    title: "Report",
    content: "Content",
    status: "submitted",
    scope_level: "polling_unit",
    scope_type: "polling_unit",
    scope_id: PU_001,
    ...overrides,
  });
}

describe("campaign_field_reports reads", () => {
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

    await seedUser("other-member", {
      ward_id: WARD_01,
      polling_unit_id: OTHER_PU,
      lga_id: LGA,
    });

    await seedUser("admin", { access_role: "admin" });
    await seedUser("officer", { access_role: "election_officer" });
    await seedUser("social", { membership_types: ["social_member"] });

    await seedReport({
      id: ids.mine,
      submitted_by: "chika",
      assignment_creator_id: "ward-coord",
      assignment_id: "assignment-1",
    });

    await seedReport({
      id: ids.againstMyAssignment,
      submitted_by: "other-member",
      assignment_creator_id: "chika",
      assignment_id: "assignment-chika",
    });

    await seedReport({
      id: ids.someoneElse,
      submitted_by: "other-member",
      assignment_creator_id: "ward-coord",
      assignment_id: "assignment-1",
    });
  });

  it("a member reads their own submissions", async () => {
    const db = authAs("chika");

    const snapshot = await assertSucceeds(
      getDocs(
        query(
          collection(db, "campaign_field_reports"),
          where("submitted_by", "==", "chika"),
        ),
      ),
    );

    expect(snapshot.docs.map((item) => item.id)).toEqual([ids.mine]);
  });

  it("a creator reads reports filed against their assignment", async () => {
    const db = authAs("chika");

    const snapshot = await assertSucceeds(
      getDocs(
        query(
          collection(db, "campaign_field_reports"),
          where("assignment_creator_id", "==", "chika"),
        ),
      ),
    );

    expect(snapshot.docs.map((item) => item.id)).toEqual([
      ids.againstMyAssignment,
    ]);
  });

  it("a member cannot read another member's report", async () => {
    const db = authAs("chika");

    await assertFails(
      getDocs(
        query(
          collection(db, "campaign_field_reports"),
          where("submitted_by", "==", "other-member"),
        ),
      ),
    );
  });

  it("a member cannot run an unfiltered list read", async () => {
    await assertFails(
      getDocs(query(collection(authAs("chika"), "campaign_field_reports"))),
    );
  });

  it("an admin reads every report unfiltered", async () => {
    const snapshot = await assertSucceeds(
      getDocs(query(collection(authAs("admin"), "campaign_field_reports"))),
    );

    expect(snapshot.size).toBe(3);
  });

  it("an election officer cannot read reports", async () => {
    await assertFails(
      getDocs(query(collection(authAs("officer"), "campaign_field_reports"))),
    );
  });

  it("a social-only member cannot read reports", async () => {
    await assertFails(
      getDocs(query(collection(authAs("social"), "campaign_field_reports"))),
    );
  });

  /* ---------------- create ---------------- */

  it("a member submits a report for their own polling unit", async () => {
    await assertSucceeds(reportCreate(authAs("chika")));
  });

  it("a member cannot submit for another polling unit", async () => {
    await assertFails(
      reportCreate(authAs("chika"), {
        scope_id: OTHER_PU,
      }),
    );
  });

  it("a signed-out client cannot submit", async () => {
    await assertFails(reportCreate(anonDb()));
  });
});
