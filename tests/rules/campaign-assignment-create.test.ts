import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  LGA,
  PU_001,
  PU_002,
  WARD_01,
  WARD_02,
  ZONE,
  OTHER_WARD,
  OTHER_PU,
  authAs,
  seedBaselineAccess,
  seedCoordinatorAccess,
  seedUser,
} from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * ============================================================
 * ASSIGNMENT CREATION AUTHORITY — ROUND 8 FIX 2A
 * ============================================================
 *
 * Before Round 8 only an admin could create an INDIVIDUAL assignment:
 * the rule checked `hasAccess("create_assignment", scope_type,
 * scope_id)`, and an individual assignment is stamped with an empty
 * scope pair, so every coordinator was denied.
 *
 * The rule now asks two separate questions:
 *
 *   individual -> is the TARGET's home area inside my authority?
 *   scope      -> is the target scope mine, or below one I hold?
 *
 * Both are answered from the caller's `create_assignment` grants, which
 * the campaign projection writes for the whole area an assignment
 * covers — no hierarchy walk in the rules, one `get()` on the target.
 */

const WARD_02_PU_001 = "nkanu-west-ward-02-pu-001";

function individualAssignment(input: {
  created_by: string;
  assigned_to_user: string;
  created_level?: string;
  created_scope_id?: string;
}) {
  return {
    title: "Call the ward chairman",
    created_by: input.created_by,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    status: "open",
    completion_mode: "individual",
    priority: "medium",

    due_at: null,
    due_date: null,

    assigned_to_user: input.assigned_to_user,
    assigned_to_scope: null,
    assigned_to: input.assigned_to_user,
    assigned_by: input.created_by,

    scope_type: "",
    scope_id: "",
    created_scope: input.created_level
      ? { level: input.created_level, scope_id: input.created_scope_id }
      : null,
    target_ward_id: null,
  };
}

function scopeAssignment(input: {
  created_by: string;
  level: string;
  scope_id: string;
  target_ward_id?: string | null;
}) {
  return {
    title: "Mobilise the polling unit",
    created_by: input.created_by,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    status: "open",
    completion_mode: "per_person",
    priority: "medium",

    due_at: null,
    due_date: null,

    assigned_to_user: null,
    assigned_to_scope: {
      level: input.level,
      scope_id: input.scope_id,
      role_filter: null,
    },
    assigned_to: "",
    assigned_by: input.created_by,

    scope_type: input.level,
    scope_id: input.scope_id,
    created_scope: null,
    target_ward_id: input.target_ward_id ?? null,
  };
}

function insert(db: Firestore, data: Record<string, unknown>) {
  return addDoc(collection(db, "campaign_assignments"), data);
}

describe("campaign_assignments create", () => {
  beforeAll(async () => {
    await initTestEnv();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  beforeEach(async () => {
    await clearDb();

    await seedUser("pu-coord", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedBaselineAccess("pu-coord", PU_001, WARD_01, LGA, ZONE);
    await seedCoordinatorAccess("pu-coord", "polling_unit", PU_001);

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
    /* The projection writes an LGA assignment's grants at every ward too. */
    await seedCoordinatorAccess("lga-coord", "ward", WARD_01);
    await seedCoordinatorAccess("lga-coord", "ward", WARD_02);

    await seedUser("chika", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedBaselineAccess("chika", PU_001, WARD_01, LGA, ZONE);

    await seedUser("member-pu1", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });

    await seedUser("member-pu2", {
      ward_id: WARD_01,
      polling_unit_id: PU_002,
      lga_id: LGA,
    });

    await seedUser("member-ward2", {
      ward_id: WARD_02,
      polling_unit_id: WARD_02_PU_001,
      lga_id: LGA,
    });

    await seedUser("member-other", {
      ward_id: OTHER_WARD,
      polling_unit_id: OTHER_PU,
      lga_id: "nsukka",
    });

    await seedUser("admin", { access_role: "admin" });
  });

  it("a PU coordinator creates an individual assignment for a member of their PU", async () => {
    await assertSucceeds(
      insert(
        authAs("pu-coord"),
        individualAssignment({
          created_by: "pu-coord",
          assigned_to_user: "member-pu1",
          created_level: "polling_unit",
          created_scope_id: PU_001,
        }),
      ),
    );
  });

  it("a PU coordinator cannot target a member of another PU", async () => {
    await assertFails(
      insert(
        authAs("pu-coord"),
        individualAssignment({
          created_by: "pu-coord",
          assigned_to_user: "member-pu2",
          created_level: "polling_unit",
          created_scope_id: PU_001,
        }),
      ),
    );
  });

  it("a PU coordinator creates a scope assignment at their own PU", async () => {
    await assertSucceeds(
      insert(
        authAs("pu-coord"),
        scopeAssignment({
          created_by: "pu-coord",
          level: "polling_unit",
          scope_id: PU_001,
          target_ward_id: WARD_01,
        }),
      ),
    );
  });

  it("a PU coordinator cannot target their ward", async () => {
    await assertFails(
      insert(
        authAs("pu-coord"),
        scopeAssignment({
          created_by: "pu-coord",
          level: "ward",
          scope_id: WARD_01,
          target_ward_id: WARD_01,
        }),
      ),
    );
  });

  it("a ward coordinator creates an individual assignment for any PU in their ward", async () => {
    await assertSucceeds(
      insert(
        authAs("ward-coord"),
        individualAssignment({
          created_by: "ward-coord",
          assigned_to_user: "member-pu2",
          created_level: "ward",
          created_scope_id: WARD_01,
        }),
      ),
    );
  });

  it("a ward coordinator creates a scope assignment at a PU inside their ward", async () => {
    await assertSucceeds(
      insert(
        authAs("ward-coord"),
        scopeAssignment({
          created_by: "ward-coord",
          level: "polling_unit",
          scope_id: PU_002,
          target_ward_id: WARD_01,
        }),
      ),
    );
  });

  it("a ward coordinator cannot target a member of another ward", async () => {
    await assertFails(
      insert(
        authAs("ward-coord"),
        individualAssignment({
          created_by: "ward-coord",
          assigned_to_user: "member-ward2",
          created_level: "ward",
          created_scope_id: WARD_01,
        }),
      ),
    );
  });

  it("an LGA coordinator creates an individual assignment for a member anywhere in the LGA", async () => {
    await assertSucceeds(
      insert(
        authAs("lga-coord"),
        individualAssignment({
          created_by: "lga-coord",
          assigned_to_user: "member-ward2",
          created_level: "lga",
          created_scope_id: LGA,
        }),
      ),
    );
  });

  it("an LGA coordinator creates a scope assignment at the LGA", async () => {
    await assertSucceeds(
      insert(
        authAs("lga-coord"),
        scopeAssignment({
          created_by: "lga-coord",
          level: "lga",
          scope_id: LGA,
        }),
      ),
    );
  });

  it("an LGA coordinator cannot target the zone", async () => {
    await assertFails(
      insert(
        authAs("lga-coord"),
        scopeAssignment({
          created_by: "lga-coord",
          level: "senatorial_zone",
          scope_id: ZONE,
        }),
      ),
    );
  });

  it("a plain campaign member cannot create an assignment", async () => {
    await assertFails(
      insert(
        authAs("chika"),
        individualAssignment({
          created_by: "chika",
          assigned_to_user: "chika",
          created_level: "polling_unit",
          created_scope_id: PU_001,
        }),
      ),
    );
  });

  it("an admin may create any assignment", async () => {
    await assertSucceeds(
      insert(
        authAs("admin"),
        individualAssignment({
          created_by: "admin",
          assigned_to_user: "member-other",
        }),
      ),
    );
  });

  it("an assignment with no target is rejected", async () => {
    const data = individualAssignment({
      created_by: "pu-coord",
      assigned_to_user: "",
      created_level: "polling_unit",
      created_scope_id: PU_001,
    });

    await assertFails(insert(authAs("pu-coord"), data));
  });
});
