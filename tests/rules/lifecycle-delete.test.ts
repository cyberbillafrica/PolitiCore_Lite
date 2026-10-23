import { assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  computeExpectedCampaignAccess,
  diffCampaignAccess,
  type CampaignAccessAssignment,
  type CampaignAccessDoc,
  type CampaignAccessProfile,
} from "@/lib/campaign-access";

import {
  COORDINATOR_PERMISSIONS,
  LGA,
  LGAS,
  PU_001,
  PU_004_01,
  STATE,
  WARD_01,
  WARD_04,
  ZONE,
  accessId,
  authAs,
  seedAccessDocs,
  seedBaselineAccess,
  seedUser,
} from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

const UID = "chika";

const PROFILE: CampaignAccessProfile = {
  access_role: "member",
  membership_types: ["campaign_member"],
  lga_id: LGA,
  ward_id: WARD_01,
  polling_unit_id: PU_001,
};

function expectedFor(
  profile: CampaignAccessProfile,
  assignments: CampaignAccessAssignment[] = [],
): CampaignAccessDoc[] {
  return computeExpectedCampaignAccess({
    userId: UID,
    profile,
    assignments,
    lgas: LGAS,
  });
}

async function actualIds(db: Firestore, uid = UID): Promise<string[]> {
  const snapshot = await getDocs(
    query(collection(db, "user_access"), where("user_id", "==", uid)),
  );

  return snapshot.docs.map((item) => item.id).sort();
}

function docData(item: CampaignAccessDoc, uid = UID) {
  return {
    user_id: uid,
    permission: item.permission,
    allowed: true,
    scope_type: item.scope_type,
    scope_id: item.scope_id,
    updated_at: new Date(),
  };
}

/** Apply a plan exactly as `applyProjectionChange()` does: full replace. */
async function applyPlan(
  db: Firestore,
  toAdd: CampaignAccessDoc[],
  toDelete: string[],
): Promise<void> {
  const batch = writeBatch(db);

  for (const item of toAdd) {
    batch.set(doc(db, "user_access", item.id), docData(item));
  }

  for (const id of toDelete) {
    batch.delete(doc(db, "user_access", id));
  }

  await batch.commit();
}

async function seedPuCoordinatorProjection(): Promise<void> {
  await seedBaselineAccess(UID, PU_001, WARD_01, LGA, ZONE);

  await seedAccessDocs(
    UID,
    COORDINATOR_PERMISSIONS.filter(
      (permission) =>
        !["view_members", "view_assignments", "submit_field_report", "report_issue", "view_activities"].includes(
          permission,
        ),
    ).map((permission) => [permission, "polling_unit", PU_001] as [string, string, string]),
  );
}

describe("campaign projection delete path", () => {
  beforeAll(async () => {
    await initTestEnv();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  beforeEach(async () => {
    await clearDb();

    await seedUser(UID, {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedUser("admin", { access_role: "admin" });
  });

  it("demoting a PU coordinator leaves exactly the 9 baseline documents", async () => {
    await seedPuCoordinatorProjection();

    const db = authAs("admin");
    const before = await actualIds(db);

    expect(before).toHaveLength(16);

    const expected = expectedFor(PROFILE, []);
    const plan = diffCampaignAccess(expected, before);

    expect(plan.toAdd).toHaveLength(0);
    expect(plan.toDelete).toHaveLength(7);

    await applyPlan(db, plan.toAdd, plan.toDelete);

    expect(await actualIds(db)).toEqual(expected.map((item) => item.id).sort());
  });

  it("changing scope from ward 04 to PU 01-004 removes the ward 04 grants", async () => {
    await seedBaselineAccess(UID, PU_001, WARD_01, LGA, ZONE);
    await seedAccessDocs(
      UID,
      COORDINATOR_PERMISSIONS.map(
        (permission) =>
          [permission, "ward", WARD_04] as [string, string, string],
      ),
    );

    const db = authAs("admin");
    const before = await actualIds(db);

    const expected = expectedFor(PROFILE, [
      {
        position: "pu_coordinator",
        scope_type: "polling_unit",
        scope_id: PU_004_01,
        status: "active",
      },
    ]);

    const plan = diffCampaignAccess(expected, before);

    /* Every WARD_04 document must be scheduled for removal. */
    expect(plan.toDelete).toContain(
      accessId(UID, "manage_activity", "ward", WARD_04),
    );
    expect(
      plan.toDelete.filter((id) => id.includes(WARD_04)),
    ).toHaveLength(COORDINATOR_PERMISSIONS.length);

    await applyPlan(db, plan.toAdd, plan.toDelete);

    const after = await actualIds(db);

    expect(after).toEqual(expected.map((item) => item.id).sort());

    /* No WARD-04-SCOPED grant survives. (PU ids for that ward contain
     * the ward prefix, so match the scope segment, not a substring.) */
    expect(after.some((id) => id.includes(`__ward__${WARD_04}`))).toBe(false);
  });

  it("demoting an admin to member removes legacy permission grants", async () => {
    await seedBaselineAccess(UID, PU_001, WARD_01, LGA, ZONE);

    await seedAccessDocs(UID, [
      ["manage_documents", "ward", WARD_01],
      ["send_notice", "state", STATE],
      ["view_analytics", "lga", LGA],
      ["manage_members", "global", ""],
    ]);

    const db = authAs("admin");
    const before = await actualIds(db);

    const expected = expectedFor(PROFILE, []);
    const plan = diffCampaignAccess(expected, before);

    expect(plan.toDelete.sort()).toEqual(
      [
        accessId(UID, "manage_documents", "ward", WARD_01),
        accessId(UID, "send_notice", "state", STATE),
        accessId(UID, "view_analytics", "lga", LGA),
        accessId(UID, "manage_members", "global", ""),
      ].sort(),
    );

    await applyPlan(db, plan.toAdd, plan.toDelete);

    expect(await actualIds(db)).toEqual(expected.map((item) => item.id).sort());
  });

  it("removing campaign_member deletes every campaign grant but keeps election results", async () => {
    await seedBaselineAccess(UID, PU_001, WARD_01, LGA, ZONE);

    const electionDoc: CampaignAccessDoc = {
      id: accessId(UID, "view_election_results", "polling_unit", PU_001),
      permission: "view_election_results",
      scope_type: "polling_unit",
      scope_id: PU_001,
    };

    await seedAccessDocs(UID, [
      ["view_election_results", "polling_unit", PU_001],
    ]);

    const db = authAs("admin");
    const before = await actualIds(db);

    const socialProfile: CampaignAccessProfile = {
      ...PROFILE,
      membership_types: ["social_member"],
    };

    const expected = expectedFor(socialProfile, []);
    expect(expected).toHaveLength(0);

    const plan = diffCampaignAccess(expected, before);

    expect(plan.toDelete).toHaveLength(9);
    expect(plan.toDelete).not.toContain(electionDoc.id);

    await applyPlan(db, plan.toAdd, plan.toDelete);

    const after = await actualIds(db);

    expect(after).toEqual([electionDoc.id]);
  });

  it("deletes an unrecorded stale grant that the recorded index cannot see", async () => {
    await seedPuCoordinatorProjection();

    const db = authAs("admin");
    const before = await actualIds(db);
    const expected = expectedFor(PROFILE, []);

    /*
     * Round 6 diffed against the ids RECORDED on the profile. A grant
     * written before that index existed was invisible, so nothing was
     * ever deleted — "0 deletions" in the migration report.
     */
    const recordedOnly = expected.map((item) => item.id);
    expect(diffCampaignAccess(expected, recordedOnly).toDelete).toHaveLength(0);

    /* Round 7 diffs against what EXISTS. */
    expect(diffCampaignAccess(expected, before).toDelete).toHaveLength(7);
  });

  it("rewrites an expected document that still carries tenant_id", async () => {
    await seedBaselineAccess(UID, PU_001, WARD_01, LGA, ZONE);

    const env = getTestEnv();

    await env.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc(`user_access/${accessId(UID, "view_members", "polling_unit", PU_001)}`)
        .set({
          user_id: UID,
          permission: "view_members",
          allowed: true,
          scope_type: "polling_unit",
          scope_id: PU_001,
          tenant_id: "legacy-tenant",
          updated_at: new Date(),
        });
    });

    const db = authAs("admin");
    const expected = expectedFor(PROFILE, []);

    const staleDoc = expected.find((item) =>
      item.id.endsWith("view_members__polling_unit__" + PU_001),
    );

    expect(staleDoc).toBeDefined();

    await applyPlan(db, [staleDoc!], []);

    const after = await getDocs(
      query(collection(db, "user_access"), where("user_id", "==", UID)),
    );

    const reloaded = after.docs.find((item) => item.id === staleDoc!.id);

    expect(reloaded?.data().tenant_id).toBeUndefined();
  });

  it("is idempotent: a second recompute deletes nothing", async () => {
    await seedPuCoordinatorProjection();

    const db = authAs("admin");
    const expected = expectedFor(PROFILE, []);
    const first = diffCampaignAccess(expected, await actualIds(db));

    await applyPlan(db, first.toAdd, first.toDelete);

    const second = diffCampaignAccess(expected, await actualIds(db));

    expect(second.toAdd).toHaveLength(0);
    expect(second.toDelete).toHaveLength(0);
  });

  it("a member can enumerate their own grants (required by the delete path)", async () => {
    await seedPuCoordinatorProjection();
    await seedAccessDocs("someone-else", [
      ["view_activities", "state", STATE],
    ]);

    const snapshot = await assertSucceeds(
      getDocs(
        query(
          collection(authAs(UID), "user_access"),
          where("user_id", "==", UID),
        ),
      ),
    );

    expect(snapshot.size).toBe(16);
    expect(snapshot.docs.every((item) => item.data().user_id === UID)).toBe(true);
  });
});
