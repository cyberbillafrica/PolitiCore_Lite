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
  LGA_WARD_SAMPLE,
  NKANU_WEST,
  lgaScope,
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
 * LGA COORDINATOR — FULL CAMPAIGN LOAD
 * ============================================================
 *
 * Reproduces Mr Timothy (production uid
 * pWO5FfesLTZTcntnNMgmfyqLZQa2): an `lga_coordinator` over a real
 * 14-ward LGA, holding the full projected grant set (187 documents).
 *
 * Every campaign page fired `scope_type == "ward" && scope_id in
 * [14 wards]` and was denied with "Missing or insufficient
 * permissions". The rules are not missing a clause for any of these
 * documents — the query itself exhausts the per-query document-access
 * budget because `hasScopedAccess()` costs three reads PER `in` value.
 *
 * These tests seed a document at every level the coordinator holds a
 * grant for and assert the real readers return all of them. They fail
 * on the pre-fix `chunkIds()` (one 14-value query) and pass once the
 * chunks stay inside the rules budget.
 */

const COORDINATOR = "lga-coordinator-timothy";

const PROFILE = {
  access_role: "member",
  membership_types: ["campaign_member"],
  ...HOME,
};

const ASSIGNMENT = {
  id: "org-lga-nkanu-west",
  user_id: COORDINATOR,
  position: "lga_coordinator",
  scope_type: "lga",
  scope_id: NKANU_WEST,
  status: "active",
  assigned_by: "admin-uid",
} as OrganizationalAssignment;

const WARD_ACTIVITIES = [`activity-${NKANU_WEST}-ward-01`, `activity-${NKANU_WEST}-ward-05`, `activity-${NKANU_WEST}-ward-09`];
const LGA_ACTIVITIES = ["activity-lga-a", "activity-lga-b", "activity-lga-c"];
const PU_ACTIVITIES = ["activity-pu-a", "activity-pu-b"];

const WARD_ISSUES = ["issue-ward-01", "issue-ward-05", "issue-ward-09"];
const LGA_ISSUES = ["issue-lga-a", "issue-lga-b", "issue-lga-c"];
const PU_ISSUES = ["issue-pu-a", "issue-pu-b"];

const WARD_ASSIGNMENTS = ["assignment-ward-01", "assignment-ward-05", "assignment-ward-09"];
const LGA_ASSIGNMENTS = ["assignment-lga-a", "assignment-lga-b", "assignment-lga-c"];
const PERSONAL_ASSIGNMENTS = ["assignment-personal-a", "assignment-personal-b"];

const REPORTS = ["report-mine-a", "report-mine-b", "report-received-a", "report-received-b"];

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
    full_name: "Mr Timothy",
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
    position: "lga_coordinator",
    scope_type: "lga",
    scope_id: NKANU_WEST,
    status: "active",
  });

  /* ---- campaign_activities: ward, LGA and PU level ---- */
  for (const [index, wardId] of LGA_WARD_SAMPLE.entries()) {
    await seedActivity({
      id: WARD_ACTIVITIES[index],
      title: `Ward activity ${wardId}`,
      scope_type: "ward",
      scope_id: wardId,
      scope_ward_id: wardId,
      visibility_ward_ids: [wardId],
    });
  }

  for (const id of LGA_ACTIVITIES) {
    await seedActivity({
      id,
      title: `LGA activity ${id}`,
      scope_type: "lga",
      scope_id: NKANU_WEST,
      scope_chain: ["enugu-state", "enugu-east", NKANU_WEST],
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

  /* ---- issues: ward, LGA and cascaded PU ---- */
  for (const [index, wardId] of LGA_WARD_SAMPLE.entries()) {
    await seedIssue({
      id: WARD_ISSUES[index],
      raised_by: `member-${wardId}`,
      scope_level: "ward",
      scope_id: wardId,
      scope_ward_id: wardId,
    });
  }

  for (const id of LGA_ISSUES) {
    await seedIssue({
      id,
      raised_by: `member-lga-${id}`,
      scope_level: "lga",
      scope_id: NKANU_WEST,
    });
  }

  for (const id of PU_ISSUES) {
    await seedIssue({
      id,
      raised_by: `member-pu-${id}`,
      scope_level: "polling_unit",
      scope_id: HOME.polling_unit_id,
      scope_ward_id: HOME.ward_id,
    });
  }

  /* ---- assignments: ward, LGA and personal ---- */
  for (const [index, wardId] of LGA_WARD_SAMPLE.entries()) {
    await seedAssignment({
      id: WARD_ASSIGNMENTS[index],
      created_by: "admin-uid",
      scope_type: "ward",
      scope_id: wardId,
      target_ward_id: wardId,
    });
  }

  for (const id of LGA_ASSIGNMENTS) {
    await seedAssignment({
      id,
      created_by: "admin-uid",
      scope_type: "lga",
      scope_id: NKANU_WEST,
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

  /* ---- reports: two he filed, two against his assignments ---- */
  await seedReport({
    id: REPORTS[0],
    submitted_by: COORDINATOR,
    assignment_creator_id: "admin-uid",
    scope_level: "lga",
    scope_id: NKANU_WEST,
  });
  await seedReport({
    id: REPORTS[1],
    submitted_by: COORDINATOR,
    assignment_creator_id: "admin-uid",
    scope_level: "ward",
    scope_id: LGA_WARD_SAMPLE[0],
  });
  await seedReport({
    id: REPORTS[2],
    submitted_by: `member-${LGA_WARD_SAMPLE[0]}`,
    assignment_creator_id: COORDINATOR,
    scope_level: "ward",
    scope_id: LGA_WARD_SAMPLE[0],
  });
  await seedReport({
    id: REPORTS[3],
    submitted_by: `member-${LGA_WARD_SAMPLE[1]}`,
    assignment_creator_id: COORDINATOR,
    scope_level: "polling_unit",
    scope_id: HOME.polling_unit_id,
  });
}

describe("LGA coordinator — full campaign load against the deployed rules", () => {
  /*
   * This file only READS after seeding, so the fixture is built once
   * instead of before every test — 187 access documents are slow to
   * write into a cold emulator and re-seeding would dominate the run.
   */
  beforeAll(async () => {
    await initTestEnv();
    await clearDb();
    await seedCoordinator();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  it("derives the full 187-document projection production holds", () => {
    const grants = grantsFor();

    /*
     * 12 coordinator permissions x (1 LGA + 14 wards) = 180 scopes,
     * plus the seven baseline documents that are not already covered
     * (PU / zone / state view_activities and the four PU-level grants).
     * This is the exact count the live diagnostic printed for Mr
     * Timothy, so the fixture cannot silently under-seed the query.
     */
    expect(grants).toHaveLength(187);

    const wardScopes = new Set(
      grants
        .filter((grant) => grant.scope_type === "ward")
        .map((grant) => grant.scope_id),
    );

    expect(wardScopes.size).toBe(14);
  });

  it("getActivitiesInScope returns ward-, LGA- and PU-scoped activities", async () => {
    const found = await getActivitiesInScope(lgaScope(), grantsFor(), {
      db: authAs(COORDINATOR),
    });

    expect(found.map((activity) => activity.id).sort()).toEqual(
      [...WARD_ACTIVITIES, ...LGA_ACTIVITIES, ...PU_ACTIVITIES].sort(),
    );
  });

  it("getIssuesInScope returns ward-, LGA- and cascaded PU-scoped issues", async () => {
    const found = await getIssuesInScope(lgaScope(), grantsFor(), {
      db: authAs(COORDINATOR),
    });

    expect(found.map((issue) => issue.id).sort()).toEqual(
      [...WARD_ISSUES, ...LGA_ISSUES, ...PU_ISSUES].sort(),
    );
  });

  it("getAssignmentsInScope returns ward-, LGA- and personally targeted work", async () => {
    const found = await getAssignmentsInScope(lgaScope(), grantsFor(), {
      db: authAs(COORDINATOR),
      viewerId: COORDINATOR,
    });

    expect(found.map((assignment) => assignment.id).sort()).toEqual(
      [...WARD_ASSIGNMENTS, ...LGA_ASSIGNMENTS, ...PERSONAL_ASSIGNMENTS].sort(),
    );
  });

  it("getReportsForUser returns reports he filed and reports he receives", async () => {
    const found = await getReportsForUser(COORDINATOR, {
      db: authAs(COORDINATOR),
    });

    expect(found.map((report) => report.id).sort()).toEqual([...REPORTS].sort());
  });
});
