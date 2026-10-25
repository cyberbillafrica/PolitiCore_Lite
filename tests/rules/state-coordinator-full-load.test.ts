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
  STATE,
  ZONE,
  ZONE_LGA_IDS,
  ZONE_WARD_SAMPLE,
  stateScope,
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
 * STATE COORDINATOR — FULL CAMPAIGN LOAD
 * ============================================================
 *
 * A `state_coordinator` assignment projects a GLOBAL grant for every
 * campaign permission (`resolveScopeTargets` maps state/campaign to
 * `{scope_type: "global"}`), so the resolver issues ONE unfiltered
 * read per collection instead of an `in` list.
 *
 * That means this level must NOT be affected by the `in`-list access
 * budget: the seed proves it stays that way. If a future change starts
 * expanding a state coordinator into per-ward queries, this file goes
 * red even though the LGA and zone suites might pass.
 */

const COORDINATOR = "state-coordinator-enugu";

const PROFILE = {
  access_role: "member",
  membership_types: ["campaign_member"],
  ...HOME,
};

const ASSIGNMENT = {
  id: "org-state-enugu",
  user_id: COORDINATOR,
  position: "state_coordinator",
  scope_type: "state",
  scope_id: STATE,
  status: "active",
  assigned_by: "admin-uid",
} as OrganizationalAssignment;

const WARD_ACTIVITIES = ["activity-state-ward-a", "activity-state-ward-b"];
const LGA_ACTIVITIES = ["activity-state-lga-a"];
const ZONE_ACTIVITIES = ["activity-state-zone-a"];
const STATE_ACTIVITIES = ["activity-state-level-a"];
const PU_ACTIVITIES = ["activity-state-pu-a"];

const WARD_ISSUES = ["issue-state-ward-a", "issue-state-ward-b"];
const LGA_ISSUES = ["issue-state-lga-a"];
const ZONE_ISSUES = ["issue-state-zone-a"];
const STATE_ISSUES = ["issue-state-level-a"];
const PU_ISSUES = ["issue-state-pu-a"];

const WARD_ASSIGNMENTS = ["assignment-state-ward-a", "assignment-state-ward-b"];
const LGA_ASSIGNMENTS = ["assignment-state-lga-a"];
const ZONE_ASSIGNMENTS = ["assignment-state-zone-a"];
const STATE_ASSIGNMENTS = ["assignment-state-level-a"];
const PERSONAL_ASSIGNMENTS = ["assignment-state-personal-a"];

const REPORTS = ["report-state-mine-a", "report-state-received-a"];

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
    full_name: "State Coordinator",
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
    position: "state_coordinator",
    scope_type: "state",
    scope_id: STATE,
    status: "active",
  });

  /* ---- activities at every level ---- */
  for (const [index, wardId] of ZONE_WARD_SAMPLE.slice(0, 2).entries()) {
    await seedActivity({
      id: WARD_ACTIVITIES[index],
      title: `Ward activity ${wardId}`,
      scope_type: "ward",
      scope_id: wardId,
      scope_ward_id: wardId,
      visibility_ward_ids: [wardId],
    });
  }

  await seedActivity({
    id: LGA_ACTIVITIES[0],
    title: "LGA activity",
    scope_type: "lga",
    scope_id: NKANU_WEST,
    scope_chain: [STATE, ZONE, NKANU_WEST],
  });

  await seedActivity({
    id: ZONE_ACTIVITIES[0],
    title: "Zone activity",
    scope_type: "senatorial_zone",
    scope_id: ZONE,
    scope_chain: [STATE, ZONE],
  });

  await seedActivity({
    id: STATE_ACTIVITIES[0],
    title: "State activity",
    scope_type: "state",
    scope_id: STATE,
    scope_chain: [STATE],
  });

  await seedActivity({
    id: PU_ACTIVITIES[0],
    title: "PU activity",
    scope_type: "polling_unit",
    scope_id: HOME.polling_unit_id,
    scope_ward_id: HOME.ward_id,
    visibility_pu_ids: [HOME.polling_unit_id],
  });

  /* ---- issues at every level ---- */
  for (const [index, wardId] of ZONE_WARD_SAMPLE.slice(0, 2).entries()) {
    await seedIssue({
      id: WARD_ISSUES[index],
      raised_by: `member-${wardId}`,
      scope_level: "ward",
      scope_id: wardId,
      scope_ward_id: wardId,
    });
  }

  await seedIssue({
    id: LGA_ISSUES[0],
    raised_by: "member-lga",
    scope_level: "lga",
    scope_id: NKANU_WEST,
  });

  await seedIssue({
    id: ZONE_ISSUES[0],
    raised_by: "member-zone",
    scope_level: "senatorial_zone",
    scope_id: ZONE,
  });

  await seedIssue({
    id: STATE_ISSUES[0],
    raised_by: "member-state",
    scope_level: "state",
    scope_id: STATE,
  });

  await seedIssue({
    id: PU_ISSUES[0],
    raised_by: "member-pu",
    scope_level: "polling_unit",
    scope_id: HOME.polling_unit_id,
    scope_ward_id: HOME.ward_id,
  });

  /* ---- assignments at every level ---- */
  for (const [index, wardId] of ZONE_WARD_SAMPLE.slice(0, 2).entries()) {
    await seedAssignment({
      id: WARD_ASSIGNMENTS[index],
      created_by: "admin-uid",
      scope_type: "ward",
      scope_id: wardId,
      target_ward_id: wardId,
    });
  }

  await seedAssignment({
    id: LGA_ASSIGNMENTS[0],
    created_by: "admin-uid",
    scope_type: "lga",
    scope_id: NKANU_WEST,
  });

  await seedAssignment({
    id: ZONE_ASSIGNMENTS[0],
    created_by: "admin-uid",
    scope_type: "senatorial_zone",
    scope_id: ZONE,
  });

  await seedAssignment({
    id: STATE_ASSIGNMENTS[0],
    created_by: "admin-uid",
    scope_type: "state",
    scope_id: STATE,
  });

  await seedAssignment({
    id: PERSONAL_ASSIGNMENTS[0],
    created_by: "admin-uid",
    assigned_to_user: COORDINATOR,
    scope_type: "lga",
    scope_id: ZONE_LGA_IDS[1],
  });

  /* ---- reports ---- */
  await seedReport({
    id: REPORTS[0],
    submitted_by: COORDINATOR,
    assignment_creator_id: "admin-uid",
    scope_level: "state",
    scope_id: STATE,
  });
  await seedReport({
    id: REPORTS[1],
    submitted_by: `member-${ZONE_WARD_SAMPLE[0]}`,
    assignment_creator_id: COORDINATOR,
    scope_level: "ward",
    scope_id: ZONE_WARD_SAMPLE[0],
  });
}

describe("State coordinator — full campaign load against the deployed rules", () => {
  /* Read-only after seeding; the 22 access documents are written once. */
  beforeAll(async () => {
    await initTestEnv();
    await clearDb();
    await seedCoordinator();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  it("derives a global grant set — 13 global permissions plus the 9 baseline scopes", () => {
    const grants = grantsFor();

    /* `state_coordinator` projects 13 permissions (the 12 shared with
     * every coordinator plus `manage_members`) and every one is GLOBAL. */
    expect(grants).toHaveLength(22);

    const global = grants.filter((grant) => grant.scope_type === "global");
    expect(global).toHaveLength(13);

    /* No ward expansion: this level must never build an `in` list. */
    expect(grants.filter((grant) => grant.scope_type === "ward")).toHaveLength(1);
  });

  it("getActivitiesInScope returns every activity in the state", async () => {
    const found = await getActivitiesInScope(stateScope(), grantsFor(), {
      db: authAs(COORDINATOR),
    });

    expect(found.map((activity) => activity.id).sort()).toEqual(
      [
        ...WARD_ACTIVITIES,
        ...LGA_ACTIVITIES,
        ...ZONE_ACTIVITIES,
        ...STATE_ACTIVITIES,
        ...PU_ACTIVITIES,
      ].sort(),
    );
  });

  it("getIssuesInScope returns every issue in the state", async () => {
    const found = await getIssuesInScope(stateScope(), grantsFor(), {
      db: authAs(COORDINATOR),
    });

    expect(found.map((issue) => issue.id).sort()).toEqual(
      [...WARD_ISSUES, ...LGA_ISSUES, ...ZONE_ISSUES, ...STATE_ISSUES, ...PU_ISSUES].sort(),
    );
  });

  it("getAssignmentsInScope returns every assignment in the state plus personal work", async () => {
    const found = await getAssignmentsInScope(stateScope(), grantsFor(), {
      db: authAs(COORDINATOR),
      viewerId: COORDINATOR,
    });

    expect(found.map((assignment) => assignment.id).sort()).toEqual(
      [
        ...WARD_ASSIGNMENTS,
        ...LGA_ASSIGNMENTS,
        ...ZONE_ASSIGNMENTS,
        ...STATE_ASSIGNMENTS,
        ...PERSONAL_ASSIGNMENTS,
      ].sort(),
    );
  });

  it("getReportsForUser returns reports he filed and reports he receives", async () => {
    const found = await getReportsForUser(COORDINATOR, {
      db: authAs(COORDINATOR),
    });

    expect(found.map((report) => report.id).sort()).toEqual([...REPORTS].sort());
  });
});
