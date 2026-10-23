import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { viewerGrants } from "@/lib/campaign-read-scope";
import { getActivitiesInScope } from "@/lib/firebase/campaignActivities";
import { getAssignmentsInScope } from "@/lib/firebase/campaignAssignments";
import { getIssuesInScope } from "@/lib/firebase/campaignIssues";
import {
  getCampaignMembersInScope,
  getMemberPositions,
} from "@/lib/firebase/campaignMembers";
import { getReportsForUser } from "@/lib/firebase/campaignReports";

import type { CampaignScope } from "@/lib/campaign-scope";
import type { OrganizationalAssignment } from "@/types";

import {
  LGAS,
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
 * CHIKA — THE PRODUCTION ACCOUNT THAT STILL 403'd
 * ============================================================
 *
 * Round 7 made every campaign read scope-filtered, but the resolver
 * still derived the query set from the GEOGRAPHIC HIERARCHY above the
 * viewer's home area. Chika is a `pu_coordinator`: her `manage_issue`
 * and `view_members` grants exist ONLY at her polling unit, so the ward
 * `issues` query and the LGA `organizational_assignments` query were
 * denied and the dashboard + area pages failed as a whole.
 *
 * This file replays her production state exactly — uid, home area, all
 * 17 `user_access` documents, and the active assignment — and then
 * calls the REAL data-layer functions against the deployed rules.
 */

const CHIKA = "Cm2CXvigSHMYHfPCKS5QT3AlCuB2";

const WARD = "nkanu-west-ward-01";
const PU = "nkanu-west-ward-01-pu-004";
const LGA = "nkanu-west";
const ZONE = "enugu-east";
const STATE = "enugu-state";

/* Peers in the same polling unit: they raised the issues and submitted
 * the report Chika only sees because she created the assignment. */
const PEER_1 = "peer-pu-004-a";
const PEER_2 = "peer-pu-004-b";

const PROFILE = {
  id: CHIKA,
  access_role: "member",
  membership_types: ["campaign_member"],
  ward_id: WARD,
  polling_unit_id: PU,
  lga_id: LGA,
};

const ASSIGNMENT = {
  id: "org-chika-pu-coordinator",
  user_id: CHIKA,
  position: "pu_coordinator",
  scope_type: "polling_unit",
  scope_id: PU,
  status: "active",
  assigned_by: "admin-uid",
} as OrganizationalAssignment;

/**
 * Her 17 `user_access` documents, exactly as production holds them.
 *
 *   9 baseline (view_activities x5, then the four PU-level grants)
 *   7 coordinator grants at PU
 *   1 election projection (not part of the campaign projection)
 */
const CHIKA_ACCESS: Array<[permission: string, scopeType: string, scopeId: string]> = [
  ["view_activities", "polling_unit", PU],
  ["view_activities", "ward", WARD],
  ["view_activities", "lga", LGA],
  ["view_activities", "senatorial_zone", ZONE],
  ["view_activities", "state", STATE],
  ["view_members", "polling_unit", PU],
  ["view_assignments", "polling_unit", PU],
  ["submit_field_report", "polling_unit", PU],
  ["report_issue", "polling_unit", PU],
  ["assign_task", "polling_unit", PU],
  ["create_activity", "polling_unit", PU],
  ["create_assignment", "polling_unit", PU],
  ["manage_activity", "polling_unit", PU],
  ["manage_issue", "polling_unit", PU],
  ["review_assignment", "polling_unit", PU],
  ["review_field_report", "polling_unit", PU],
  ["view_election_results", "polling_unit", PU],
];

const CHIKA_SCOPE: CampaignScope = {
  level: "polling_unit",
  scope_id: PU,
  label: "PU 004",
  lgaIds: [LGA],
  wardIds: [WARD],
  pollingUnitIds: [PU],
};

const activities = {
  pu: "activity-pu-004",
  ward: "activity-ward-01",
  lga: "activity-lga-nkanu-west",
  zone: "activity-zone-enugu-east",
  state: "activity-state-enugu",
  otherWard: "activity-ward-02",
};

const issues = {
  pu: ["issue-pu-004-a", "issue-pu-004-b"],
  ward: "issue-ward-01",
};

const reports = {
  mine: "report-submitted-by-chika",
  received: "report-against-chika-assignment",
};

async function seedChika(): Promise<void> {
  await seedUser(CHIKA, {
    access_role: "member",
    membership_types: ["campaign_member"],
    ward_id: WARD,
    polling_unit_id: PU,
    lga_id: LGA,
    full_name: "Chika",
  });

  await seedAccessDocs(CHIKA, CHIKA_ACCESS);

  await seedOrganizationalAssignment({
    id: ASSIGNMENT.id,
    user_id: CHIKA,
    position: "pu_coordinator",
    scope_type: "polling_unit",
    scope_id: PU,
    status: "active",
  });

  await seedUser(PEER_1, {
    ward_id: WARD,
    polling_unit_id: PU,
    lga_id: LGA,
    full_name: "Peer One",
  });
  await seedUser(PEER_2, {
    ward_id: WARD,
    polling_unit_id: PU,
    lga_id: LGA,
    full_name: "Peer Two",
  });

  /* One activity per level she holds `view_activities` for. */
  await seedActivity({
    id: activities.pu,
    scope_type: "polling_unit",
    scope_id: PU,
    scope_ward_id: WARD,
    visibility_pu_ids: [PU],
  });
  await seedActivity({
    id: activities.ward,
    scope_type: "ward",
    scope_id: WARD,
    scope_ward_id: WARD,
    visibility_ward_ids: [WARD],
  });
  await seedActivity({
    id: activities.lga,
    scope_type: "lga",
    scope_id: LGA,
    scope_chain: [STATE, ZONE, LGA],
  });
  await seedActivity({
    id: activities.zone,
    scope_type: "senatorial_zone",
    scope_id: ZONE,
    scope_chain: [STATE, ZONE],
  });
  await seedActivity({
    id: activities.state,
    scope_type: "state",
    scope_id: STATE,
    scope_chain: [STATE],
  });

  /* Outside her grants: a different ward in the same LGA. */
  await seedActivity({
    id: activities.otherWard,
    scope_type: "ward",
    scope_id: "nkanu-west-ward-02",
    scope_ward_id: "nkanu-west-ward-02",
    visibility_ward_ids: ["nkanu-west-ward-02"],
  });

  /* Two issues at her polling unit, raised by peers. */
  await seedIssue({
    id: issues.pu[0],
    raised_by: PEER_1,
    scope_level: "polling_unit",
    scope_id: PU,
    scope_ward_id: WARD,
  });
  await seedIssue({
    id: issues.pu[1],
    raised_by: PEER_2,
    scope_level: "polling_unit",
    scope_id: PU,
    scope_ward_id: WARD,
  });

  /* One issue at ward level. She holds NO ward `manage_issue` grant, so
   * this must be invisible AND must never be queried. */
  await seedIssue({
    id: issues.ward,
    raised_by: PEER_1,
    scope_level: "ward",
    scope_id: WARD,
    scope_ward_id: WARD,
  });

  /* One assignment targeted at her polling unit. */
  await seedAssignment({
    id: "assignment-pu-004",
    created_by: "ward-coord-uid",
    scope_type: "polling_unit",
    scope_id: PU,
    target_ward_id: WARD,
  });

  /* A report she submitted, and one answering an assignment she owns. */
  await seedReport({
    id: reports.mine,
    submitted_by: CHIKA,
    assignment_creator_id: "ward-coord-uid",
    scope_level: "polling_unit",
    scope_id: PU,
  });
  await seedReport({
    id: reports.received,
    submitted_by: PEER_1,
    assignment_creator_id: CHIKA,
    scope_level: "polling_unit",
    scope_id: PU,
  });
}

describe("Chika — full campaign load against the deployed rules", () => {
  beforeAll(async () => {
    await initTestEnv();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  beforeEach(async () => {
    await clearDb();
    await seedChika();
  });

  const grantsFor = () =>
    viewerGrants({
      userId: CHIKA,
      profile: PROFILE,
      assignments: [ASSIGNMENT],
      lgas: LGAS,
    });

  it("getActivitiesInScope reads only the five levels she holds view_activities for", async () => {
    const grants = grantsFor();

    /*
     * The resolver must reproduce the projection production wrote: 16
     * campaign documents (9 baseline + 7 new coordinator grants). The
     * 17th `user_access` document is the election projection, which the
     * campaign resolver never claims.
     */
    const campaignDocs = CHIKA_ACCESS.filter(
      ([permission]) => permission !== "view_election_results",
    );

    expect(grants).toHaveLength(campaignDocs.length);

    for (const [permission, scope_type, scope_id] of campaignDocs) {
      expect(grants).toContainEqual({ permission, scope_type, scope_id });
    }

    const found = await getActivitiesInScope(CHIKA_SCOPE, grants, {
      db: authAs(CHIKA),
    });

    expect(found.length).toBeGreaterThanOrEqual(5);

    expect(found.map((activity) => activity.id).sort()).toEqual(
      [
        activities.pu,
        activities.ward,
        activities.lga,
        activities.zone,
        activities.state,
      ].sort(),
    );
  });

  it("getIssuesInScope succeeds — only PU-scoped issues are queried, never the ward", async () => {
    const found = await getIssuesInScope(CHIKA_SCOPE, grantsFor(), {
      db: authAs(CHIKA),
    });

    expect(found.map((issue) => issue.id).sort()).toEqual([...issues.pu].sort());
  });

  it("getMemberPositions succeeds — only PU-scoped assignments are queried, never the LGA", async () => {
    const positions = await getMemberPositions(
      [CHIKA, PEER_1, PEER_2],
      CHIKA_SCOPE,
      grantsFor(),
      { db: authAs(CHIKA) },
    );

    expect(positions.get(CHIKA)).toEqual({
      position: "pu_coordinator",
      level: "polling_unit",
      scope_id: PU,
    });
  });

  it("getAssignmentsInScope succeeds at her polling unit", async () => {
    const found = await getAssignmentsInScope(CHIKA_SCOPE, grantsFor(), {
      db: authAs(CHIKA),
      viewerId: CHIKA,
    });

    expect(found.map((assignment) => assignment.id)).toContain(
      "assignment-pu-004",
    );
  });

  it("getReportsForUser succeeds through submitted_by + assignment_creator_id", async () => {
    const found = await getReportsForUser(CHIKA, { db: authAs(CHIKA) });

    expect(found.map((report) => report.id).sort()).toEqual(
      [reports.mine, reports.received].sort(),
    );
  });

  it("getCampaignMembersInScope succeeds for her polling unit", async () => {
    const found = await getCampaignMembersInScope(CHIKA_SCOPE, grantsFor(), {
      db: authAs(CHIKA),
    });

    expect(found.map((member) => member.id).sort()).toEqual(
      [CHIKA, PEER_1, PEER_2].sort(),
    );
  });
});
