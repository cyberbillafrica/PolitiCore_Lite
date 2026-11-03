import { afterAll, afterEach, beforeAll, describe, it } from "vitest";

import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { clearDb, getTestEnv, initTestEnv } from "./setup";

import {
  LGA,
  PU_001,
  WARD_01,
  authAs,
  seedActivity,
  seedAssignment,
  seedBaselineAccess,
  seedUser,
} from "./helpers";

/*
 * ============================================================
 * ROUND 17 — REGISTRATION GATE
 * ============================================================
 *
 * A public signup creates `status: "pending"` with NO campaign grants.
 * Until an admin approves:
 *
 *   - the owner can read their own profile (the login gate needs it)
 *   - the owner cannot read election data (isActiveUser())
 *   - the owner cannot read campaign docs that need a grant
 *     (there is no `user_access` document)
 *   - the owner cannot approve themselves, in any field the access
 *     decision depends on
 *
 * Approval is an admin write; rejection is the same rule path.
 */

beforeAll(async () => {
  await initTestEnv();
});

afterEach(async () => {
  await clearDb();
});

afterAll(async () => {
  await getTestEnv().cleanup();
});

function selfProfile(uid: string, status: string) {
  return {
    access_role: "member",
    membership_types: ["campaign_member"],
    lga_id: LGA,
    ward_id: WARD_01,
    polling_unit_id: PU_001,
    full_name: "New Volunteer",
    email: `${uid}@example.test`,
    points: 0,
    rank: "Volunteer",
    status,
    created_at: new Date(),
  };
}

async function seedResult(
  id: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await getTestEnv().withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "election_results", id), {
      contest_id: "contest-1",
      result_level: "polling_unit",
      lga_id: LGA,
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      results: [{ party: "APC", votes: 10 }],
      status: "submitted",
      verified: false,
      submitted_by: "pending-uid",
      cloudinary_url: "https://example.test/evidence.jpg",
      created_at: new Date(),
      ...overrides,
    });
  });
}

describe("public signup (users create)", () => {
  it("lets the owner create a pending profile", async () => {
    const db = authAs("new-uid");

    await assertSucceeds(
      setDoc(doc(db, "users", "new-uid"), selfProfile("new-uid", "pending")),
    );
  });

  it("refuses a self-created profile that claims active", async () => {
    const db = authAs("new-uid");

    await assertFails(
      setDoc(doc(db, "users", "new-uid"), selfProfile("new-uid", "active")),
    );
  });

  it("refuses a self-created profile with no status at all", async () => {
    const db = authAs("new-uid");
    const profile = selfProfile("new-uid", "pending") as Record<string, unknown>;

    delete profile.status;

    await assertFails(setDoc(doc(db, "users", "new-uid"), profile));
  });

  it("still lets an admin create a pre-approved member (legacy path)", async () => {
    await seedUser("admin-uid", { access_role: "admin" });

    const db = authAs("admin-uid");
    const profile = selfProfile("created-by-admin", "pending") as Record<
      string,
      unknown
    >;

    delete profile.status;

    await assertSucceeds(
      setDoc(doc(db, "users", "created-by-admin"), profile),
    );
  });
});

describe("blocked accounts (pending / rejected / suspended)", () => {
  it("lets a pending user read their own profile (the gate needs it)", async () => {
    await seedUser("pending-uid", { status: "pending" });

    const db = authAs("pending-uid");

    await assertSucceeds(getDoc(doc(db, "users", "pending-uid")));
  });

  it("refuses election results to a pending user, even for their own submission", async () => {
    await seedUser("pending-uid", { status: "pending" });
    await seedResult("result-1", { submitted_by: "pending-uid" });

    const db = authAs("pending-uid");

    await assertFails(getDoc(doc(db, "election_results", "result-1")));
  });

  it("refuses election results to a rejected user", async () => {
    await seedUser("rejected-uid", { status: "rejected" });
    await seedResult("result-1", { submitted_by: "rejected-uid" });

    const db = authAs("rejected-uid");

    await assertFails(getDoc(doc(db, "election_results", "result-1")));
  });

  it("keeps suspension behaviour unchanged", async () => {
    await seedUser("suspended-uid", { status: "suspended" });
    await seedResult("result-1", { submitted_by: "suspended-uid" });

    const db = authAs("suspended-uid");

    await assertFails(getDoc(doc(db, "election_results", "result-1")));
  });

  it("refuses a grant-gated activity to a pending user with no projection", async () => {
    await seedUser("pending-uid", { status: "pending" });

    await seedActivity({
      id: "activity-1",
      scope_type: "ward",
      scope_id: WARD_01,
      visibility_ward_ids: [],
      visibility_pu_ids: [],
    });

    const db = authAs("pending-uid");

    await assertFails(getDoc(doc(db, "campaign_activities", "activity-1")));
  });

  it("refuses an assignment to a pending user with no projection", async () => {
    await seedUser("pending-uid", { status: "pending" });
    await seedAssignment({ id: "assignment-1" });

    const db = authAs("pending-uid");

    await assertFails(getDoc(doc(db, "campaign_assignments", "assignment-1")));
  });

  it("lets an approved member with the baseline read the same activity", async () => {
    await seedUser("approved-uid", { status: "active" });
    await seedBaselineAccess("approved-uid");

    await seedActivity({
      id: "activity-1",
      scope_type: "ward",
      scope_id: WARD_01,
      visibility_ward_ids: [],
      visibility_pu_ids: [],
    });

    const db = authAs("approved-uid");

    await assertSucceeds(
      getDoc(doc(db, "campaign_activities", "activity-1")),
    );
  });

  it("lets an approved member read an assignment assigned to them", async () => {
    await seedUser("approved-uid", { status: "active" });
    await seedAssignment({ id: "assignment-1", assigned_to_user: "approved-uid" });

    const db = authAs("approved-uid");

    await assertSucceeds(
      getDoc(doc(db, "campaign_assignments", "assignment-1")),
    );
  });

  /*
   * KNOWN LIMITATION (reported, out of scope for Round 17).
   *
   * `campaign_activities` also has a MEMBERSHIP read clause that does not
   * consult `user_access`: any profile whose `membership_types` includes
   * `campaign_member` may read activities stamped for their own ward/PU.
   * A pending profile still carries that membership type, so an activity
   * written with visibility stamps is readable through the SDK.
   *
   * Closing it needs `isActiveUser()` on the campaign clause, which this
   * round's constraints forbid. `it.fails` documents the hole and turns
   * red the day it is fixed — change this to `it` then.
   */
  it.fails(
    "known limitation: a pending user can still read an activity stamped for their ward",
    async () => {
      await seedUser("pending-uid", { status: "pending" });

      await seedActivity({
        id: "activity-stamped",
        scope_type: "ward",
        scope_id: WARD_01,
        visibility_ward_ids: [WARD_01],
        visibility_pu_ids: [],
      });

      const db = authAs("pending-uid");

      await assertFails(getDoc(doc(db, "campaign_activities", "activity-stamped")));
    },
  );
});

describe("owner updates cannot change access", () => {
  it("lets the owner edit their name while status is unchanged", async () => {
    await seedUser("pending-uid", { status: "pending" });

    const db = authAs("pending-uid");

    await assertSucceeds(
      updateDoc(doc(db, "users", "pending-uid"), { full_name: "Corrected Name" }),
    );
  });

  it("refuses a self-approval", async () => {
    await seedUser("pending-uid", { status: "pending" });

    const db = authAs("pending-uid");

    await assertFails(
      updateDoc(doc(db, "users", "pending-uid"), { status: "active" }),
    );
  });

  it("refuses a self-injected projection index", async () => {
    await seedUser("pending-uid", { status: "pending" });

    const db = authAs("pending-uid");

    await assertFails(
      updateDoc(doc(db, "users", "pending-uid"), {
        access_projection_ids: ["pending-uid__view_members__polling_unit__x"],
      }),
    );
  });
});

describe("admin review", () => {
  it("lets an admin approve a pending registration", async () => {
    await seedUser("admin-uid", { access_role: "admin" });
    await seedUser("pending-uid", { status: "pending" });

    const db = authAs("admin-uid");

    await assertSucceeds(
      updateDoc(doc(db, "users", "pending-uid"), {
        status: "active",
        full_name: "Reviewed Name",
      }),
    );
  });

  it("lets an admin decline a pending registration", async () => {
    await seedUser("admin-uid", { access_role: "admin" });
    await seedUser("pending-uid", { status: "pending" });

    const db = authAs("admin-uid");

    await assertSucceeds(
      updateDoc(doc(db, "users", "pending-uid"), {
        status: "rejected",
        rejection_reason: "Duplicate registration",
      }),
    );
  });

  it("lets an admin write the projection index", async () => {
    await seedUser("admin-uid", { access_role: "admin" });
    await seedUser("pending-uid", { status: "pending" });

    const db = authAs("admin-uid");

    await assertSucceeds(
      updateDoc(doc(db, "users", "pending-uid"), {
        status: "active",
        access_projection_ids: [
          "pending-uid__view_activities__ward__nkanu-west-ward-01",
        ],
      }),
    );
  });

  it("refuses a member changing somebody else's status", async () => {
    await seedUser("member-uid");
    await seedUser("other-uid", { status: "pending" });

    const db = authAs("member-uid");

    await assertFails(
      updateDoc(doc(db, "users", "other-uid"), { status: "active" }),
    );
  });
});

describe("registration notifications", () => {
  it("lets a pending account notify an admin", async () => {
    await seedUser("pending-uid", { status: "pending" });
    await seedUser("admin-uid", { access_role: "admin" });

    const db = authAs("pending-uid");

    await assertSucceeds(
      setDoc(doc(db, "notifications", "n1"), {
        user_id: "admin-uid",
        actor_id: "pending-uid",
        type: "registration_pending",
        title: "New registration: New Volunteer",
        message: "New Volunteer registered from Ward 01.",
        link: "/portal/admin/registrations",
        entity_type: "user",
        entity_id: "pending-uid",
        read: false,
        created_at: serverTimestamp(),
      }),
    );
  });

  it("refuses a notification type outside the vocabulary", async () => {
    await seedUser("pending-uid", { status: "pending" });

    const db = authAs("pending-uid");

    await assertFails(
      setDoc(doc(db, "notifications", "n2"), {
        user_id: "admin-uid",
        actor_id: "pending-uid",
        type: "registration_something",
        title: "New registration",
        message: "…",
        link: "/portal/admin/registrations",
        entity_type: "user",
        entity_id: "pending-uid",
        read: false,
        created_at: serverTimestamp(),
      }),
    );
  });
});
