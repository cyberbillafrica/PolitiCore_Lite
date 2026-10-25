import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { viewerGrants } from "@/lib/campaign-read-scope";
import { getActivitiesInScope } from "@/lib/firebase/campaignActivities";
import { getAssignmentsInScope } from "@/lib/firebase/campaignAssignments";
import { getIssuesInScope } from "@/lib/firebase/campaignIssues";
import { getReportsForUser } from "@/lib/firebase/campaignReports";

import type { OrganizationalAssignment } from "@/types";

import {
  FULL_LGAS,
  HOME,
  NKANU_WEST,
  ZONE,
  ZONE_LGA_IDS,
  ZONE_WARD_SAMPLE,
  zoneScope,
} from "./full-hierarchy";
import {
  authAs,
  seedAccessDocs,
  seedActivity,
  seedAssignment,
  seedIssue,
  seedOrganizationalAssignment,
  seedReport,
  seedUser,
} from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * ============================================================
 * ZONAL COORDINATOR — FULL CAMPAIGN LOAD
 * ============================================================
 *
 * A `zone_coordinator` over Enugu East: 3 LGAs, 34 wards, 462
 * projected `user_access` documents. The projection expands the zone
 * into every ward, so every campaign reader used to fire a single
 * `scope_id in [34 wards]` query — well past the rules access budget,
 * denied as a whole.
 *
 * The seed puts work at all four levels of the zone (ward, LGA, zone
 * and PU) and the assertions require every one of them back.
 */

const COORDINATOR = "zone-coordinator-enugu-east";

const PROFILE = {
  access_role: "member",
  membership_types: ["campaign_member"],
  ...HOME,
};

const ASSIGNMENT = {
  id: "org-zone-enugu-east",
  user_id: COORDINATOR,
  position: "zone_coordinator",
  scope_type: "senatorial_zone",
  scope_id: ZONE,
  status: "active",
  assigned_by: "admin-uid",
} as OrganizationalAssignment;

const WARD_ACTIVITIES = ["activity-zone-ward-a", "activity-zone-ward-b", "activity-zone-ward-c"];
const LGA_ACTIVITIES = ["activity-zone-lga-a", "activity-zone-lga-b", "activity-zone-lga-c"];
const ZONE_ACTIVITIES = ["activity-zone-level-a"];
const PU_ACTIVITIES = ["activity-zone-pu-a", "activity-zone-pu-b"];

const WARD_ISSUES = ["issue-zone-ward-a", "issue-zone-ward-b", "issue-zone-ward-c"];
const LGA_ISSUES = ["issue-zone-lga-a", "issue-zone-lga-b", "issue-zone-lga-c"];
const ZONE_ISSUES = ["issue-zone-level-a"];
const PU_ISSUES = ["issue-zone-pu-a", "issue-zone-pu-b"];

const WARD_ASSIGNMENTS = ["assignment-zone-ward-a", "assignment-zone-ward-b", "assignment-zone-ward-c"];
const LGA_ASSIGNMENTS = ["assignment-zone-lga-a", "assignment-zone-lga-b", "assignment-zone-lga-c"];
const ZONE_ASSIGNMENTS = ["assignment-zone-level-a"];
const PERSONAL_ASSIGNMENTS = ["assignment-zone-personal-a", "assignment-zone-personal-b"];

const REPORTS = ["report-zone-mine-a", "report-zone-mine-b", "report-zone-received-a", "report-zone-received-b"];

function grantsFor() {
  return viewerGrants({
    userId: COORDINATOR,
    profile: PROFILE,
    assignments: [ASSIGNMENT],
    lgas: FULL_LGAS,
  });
}

async function seedCoordinator(): Promise<void> {
  await seedUser(COORDINATOR, {
    access_role: "member",
    membership_types: ["campaign_member"],
    ...HOME,
    full_name: "Zonal Coordinator",
  });

  await seedAccessDocs(
    COORDINATOR,
    grantsFor().map(
      (grant) => [grant.permission, grant.scope_type, grant.scope_id] as [string, string, string],
    ),
  );

  await seedOrganizationalAssignment({
    id: ASSIGNMENT.id,
    user_id: COORDINATOR,
    position: "zone_coordinator",
    scope_type: "senatorial_zone",
    scope_id: ZONE,
    status: "active",
  });

  /* ---- activities: one per level of the zone ---- */
  for (const [index, wardId] of ZONE_WARD_SAMPLE.entries()) {
    await seedActivity({
      id: WARD_ACTIVITIES[index],
      title: `Ward activity ${wardId}`,
      scope_type: "ward",
      scope_id: wardId,
      scope_ward_id: wardId,
      visibility_ward_ids: [wardId],
    });
  }

  for (const [index, lgaId] of ZONE_LGA_IDS.entries()) {
    await seedActivity({
      id: LGA_ACTIVITIES[index],
      title: `LGA activity ${lgaId}`,
      scope_type: "lga",
      scope_id: lgaId,
      scope_chain: ["enugu-state", ZONE, lgaId],
    });
  }

  for (const id of ZONE_ACTIVITIES) {
    await seedActivity({
      id,
      title: "Zone activity",
      scope_type: "senatorial_zone",
      scope_id: ZONE,
      scope_chain: ["enugu-state", ZONE],
    });
  }

  for (const id of PU_ACTIVITIES) {
    await seedActivity({
      id,
      title: `PU activity ${id}`,
      scope_type: "polling_unit",
      scope_id: HOME.polling_unit_id,
      scope_ward_id: HOME.ward_id,
      visibility_pu_ids: [HOME.polling_unit_id],
    });
  }

  /* ---- issues ---- */
  for (const [index, wardId] of ZONE_WARD_SAMPLE.entries()) {
    await seedIssue({
      id: WARD_ISSUES[index],
      raised_by: `member-${wardId}`,
      scope_level: "ward",
      scope_id: wardId,
      scope_ward_id: wardId,
    });
  }

  for (const [index, lgaId] of ZONE_LGA_IDS.entries()) {
    await seedIssue({
      id: LGA_ISSUES[index],
      raised_by: `member-${lgaId}`,
      scope_level: "lga",
      scope_id: lgaId,
    });
  }

  for (const id of ZONE_ISSUES) {
    await seedIssue({
      id,
      raised_by: "member-zone",
      scope_level: "senatorial_zone",
      scope_id: ZONE,
    });
  }

  for (const id of PU_ISSUES) {
    await seedIssue({
      id,
      raised_by: `member-${id}`,
      scope_level: "polling_unit",
      scope_id: HOME.polling_unit_id,
      scope_ward_id: HOME.ward_id,
    });
  }

  /* ---- assignments ---- */
  for (const [index, wardId] of ZONE_WARD_SAMPLE.entries()) {
    await seedAssignment({
      id: WARD_ASSIGNMENTS[index],
      created_by: "admin-uid",
      scope_type: "ward",
      scope_id: wardId,
      target_ward_id: wardId,
    });
  }

  for (const [index, lgaId] of ZONE_LGA_IDS.entries()) {
    await seedAssignment({
      id: LGA_ASSIGNMENTS[index],
      created_by: "admin-uid",
      scope_type: "lga",
      scope_id: lgaId,
    });
  }

  for (const id of ZONE_ASSIGNMENTS) {
    await seedAssignment({
      id,
      created_by: "admin-uid",
      scope_type: "senatorial_zone",
      scope_id: ZONE,
    });
  }

  for (const id of PERSONAL_ASSIGNMENTS) {
    await seedAssignment({
      id,
      created_by: "admin-uid",
      assigned_to_user: COORDINATOR,
      scope_type: "lga",
      scope_id: NKANU_WEST,
    });
  }

  /* ---- reports ---- */
  await seedReport({
    id: REPORTS[0],
    submitted_by: COORDINATOR,
    assignment_creator_id: "admin-uid",
    scope_level: "senatorial_zone",
    scope_id: ZONE,
  });
  await seedReport({
    id: REPORTS[1],
    submitted_by: COORDINATOR,
    assignment_creator_id: "admin-uid",
    scope_level: "ward",
    scope_id: ZONE_WARD_SAMPLE[0],
  });
  await seedReport({
    id: REPORTS[2],
    submitted_by: `member-${ZONE_WARD_SAMPLE[0]}`,
    assignment_creator_id: COORDINATOR,
    scope_level: "ward",
    scope_id: ZONE_WARD_SAMPLE[0],
  });
  await seedReport({
    id: REPORTS[3],
    submitted_by: `member-${ZONE_WARD_SAMPLE[1]}`,
    assignment_creator_id: COORDINATOR,
    scope_level: "lga",
    scope_id: ZONE_LGA_IDS[1],
  });
}

describe("Zonal coordinator — full campaign load against the deployed rules", () => {
  /*
   * Read-only after seeding: 462 access documents written once, not
   * once per test. Order independence is preserved because no test
   * mutates the fixture.
   */
  beforeAll(async () => {
    await initTestEnv();
    await clearDb();
    await seedCoordinator();
    /* 462 access documents plus the fixtures: the default 90s is tight. */
  }, 240_000);

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  it("derives the full 462-document projection production holds", () => {
    const grants = grantsFor();

    /* 12 permissions x (1 zone + 3 LGAs + 34 wards) = 456, plus the
     * six baseline documents not already covered by those scopes. */
    expect(grants).toHaveLength(462);

    const wardScopes = new Set(
      grants
        .filter((grant) => grant.scope_type === "ward")
        .map((grant) => grant.scope_id),
    );

    expect(wardScopes.size).toBe(34);
  });

  it("getActivitiesInScope returns work at ward, LGA, zone and PU level", async () => {
    const found = await getActivitiesInScope(zoneScope(), grantsFor(), {
      db: authAs(COORDINATOR),
    });

    expect(found.map((activity) => activity.id).sort()).toEqual(
      [...WARD_ACTIVITIES, ...LGA_ACTIVITIES, ...ZONE_ACTIVITIES, ...PU_ACTIVITIES].sort(),
    );
  }, 120_000);

  it("getIssuesInScope returns work at ward, LGA, zone and PU level", async () => {
    const found = await getIssuesInScope(zoneScope(), grantsFor(), {
      db: authAs(COORDINATOR),
    });

    expect(found.map((issue) => issue.id).sort()).toEqual(
      [...WARD_ISSUES, ...LGA_ISSUES, ...ZONE_ISSUES, ...PU_ISSUES].sort(),
    );
  }, 120_000);

  it("getAssignmentsInScope returns work at ward, LGA and zone level plus personal work", async () => {
    const found = await getAssignmentsInScope(zoneScope(), grantsFor(), {
      db: authAs(COORDINATOR),
      viewerId: COORDINATOR,
    });

    expect(found.map((assignment) => assignment.id).sort()).toEqual(
      [
        ...WARD_ASSIGNMENTS,
        ...LGA_ASSIGNMENTS,
        ...ZONE_ASSIGNMENTS,
        ...PERSONAL_ASSIGNMENTS,
      ].sort(),
    );
  }, 120_000);

  it("getReportsForUser returns reports he filed and reports he receives", async () => {
    const found = await getReportsForUser(COORDINATOR, {
      db: authAs(COORDINATOR),
    });

    expect(found.map((report) => report.id).sort()).toEqual([...REPORTS].sort());
  });
});
