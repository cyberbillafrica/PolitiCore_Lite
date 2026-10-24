import { assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  LGA,
  LGAS,
  OTHER_PU,
  OTHER_WARD,
  PU_001,
  PU_002,
  WARD_01,
  WARD_02,
  ZONE,
  authAs,
  seedBaselineAccess,
  seedCoordinatorAccess,
  seedIssue,
  seedUser,
} from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

import { resolveCampaignScope } from "@/lib/campaign-scope";
import {
  adminScopeGrants,
  viewerGrants,
  type ViewerGrant,
} from "@/lib/campaign-read-scope";
import {
  scopeContainsTarget,
  stateWideScope,
  stateWideScopes,
  writableScopes,
} from "@/lib/campaign-scope-options";
import { getIssuesInScope } from "@/lib/firebase/campaignIssues";

/*
 * ============================================================
 * ISSUES PAGE DEFAULT + FILTER — ROUND 8 FIX 4
 * ============================================================
 *
 * Bug: an admin landed on /portal/campaign/issues and saw NOTHING
 * until a scope was picked, because the page passed `null` into
 * `getIssuesInScope()` — which returns [] by design — while the picker
 * defaulted to "All". Coordinators had no picker at all.
 *
 * The page now loads everything the viewer may see once (admin: the
 * whole state) and narrows in memory. These assertions run the REAL
 * reader against the rules, plus the pure option/narrowing helpers the
 * page renders from.
 */

const ALL_ISSUE_IDS = [
  "issue-chika-pu",
  "issue-other-pu",
  "issue-other-ward",
  "issue-peer-pu",
  "issue-pu2",
  "issue-ward",
];

function ids(issues: { id: string }[]): string[] {
  return issues.map((issue) => issue.id).sort();
}

function grantsFor(viewer: {
  uid: string;
  pu: string;
  ward: string;
  lga: string;
  position?: "ward_coordinator" | "lga_coordinator";
  scope?: string;
}): ViewerGrant[] {
  return viewerGrants({
    userId: viewer.uid,
    profile: {
      access_role: "member",
      membership_types: ["campaign_member"],
      polling_unit_id: viewer.pu,
      ward_id: viewer.ward,
      lga_id: viewer.lga,
    },
    assignments: viewer.position
      ? [
          {
            position: viewer.position,
            scope_type: viewer.position === "ward_coordinator" ? "ward" : "lga",
            scope_id: viewer.scope ?? viewer.ward,
            status: "active",
          },
        ]
      : [],
    lgas: LGAS,
  });
}

describe("issues page visibility", () => {
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

    await seedUser("peer", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedBaselineAccess("peer", PU_001, WARD_01, LGA, ZONE);

    await seedUser("ward-coord", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedBaselineAccess("ward-coord", PU_001, WARD_01, LGA, ZONE);
    await seedCoordinatorAccess("ward-coord", "ward", WARD_01);

    await seedUser("admin", { access_role: "admin" });

    await seedIssue({
      id: "issue-chika-pu",
      raised_by: "chika",
      scope_level: "polling_unit",
      scope_id: PU_001,
      scope_ward_id: WARD_01,
    });

    await seedIssue({
      id: "issue-peer-pu",
      raised_by: "peer",
      scope_level: "polling_unit",
      scope_id: PU_001,
      scope_ward_id: WARD_01,
    });

    await seedIssue({
      id: "issue-ward",
      raised_by: "peer",
      scope_level: "ward",
      scope_id: WARD_01,
      scope_ward_id: null,
    });

    await seedIssue({
      id: "issue-pu2",
      raised_by: "peer",
      scope_level: "polling_unit",
      scope_id: PU_002,
      scope_ward_id: WARD_01,
    });

    await seedIssue({
      id: "issue-other-ward",
      raised_by: "peer",
      scope_level: "ward",
      scope_id: WARD_02,
      scope_ward_id: null,
    });

    await seedIssue({
      id: "issue-other-pu",
      raised_by: "peer",
      scope_level: "polling_unit",
      scope_id: OTHER_PU,
      scope_ward_id: OTHER_WARD,
    });
  });

  it("an admin sees every issue on load with no scope selected", async () => {
    const db = authAs("admin");

    const issues = await getIssuesInScope(
      stateWideScope(LGAS),
      adminScopeGrants(null, ["manage_issue"]),
      { db },
    );

    expect(ids(issues)).toEqual(ALL_ISSUE_IDS);
  });

  it("an admin's filter offers 'All' plus every scope", () => {
    const options = stateWideScopes(LGAS);
    const levels = new Set(options.map((option) => option.level));

    expect(levels).toEqual(
      new Set([
        "state",
        "senatorial_zone",
        "lga",
        "ward",
        "polling_unit",
      ]),
    );

    /* "All" is the picker's allowAll option; every real scope is listed. */
    expect(options.some((option) => option.scope_id === LGA)).toBe(true);
    expect(options.some((option) => option.scope_id === WARD_01)).toBe(true);
    expect(options.some((option) => option.scope_id === PU_001)).toBe(true);
  });

  it("a ward coordinator sees their ward and PU issues by default", async () => {
    const db = authAs("ward-coord");
    const grants = grantsFor({
      uid: "ward-coord",
      pu: PU_001,
      ward: WARD_01,
      lga: LGA,
      position: "ward_coordinator",
      scope: WARD_01,
    });

    const scope = await resolveCampaignScope("ward", WARD_01, LGAS);
    const issues = await getIssuesInScope(scope, grants, { db });

    expect(ids(issues)).toEqual(
      ["issue-chika-pu", "issue-pu2", "issue-peer-pu", "issue-ward"].sort(),
    );
  });

  it("a ward coordinator's filter only offers their ward and its PUs", () => {
    const grants = grantsFor({
      uid: "ward-coord",
      pu: PU_001,
      ward: WARD_01,
      lga: LGA,
      position: "ward_coordinator",
      scope: WARD_01,
    });

    const options = writableScopes(grants, "manage_issue", LGAS);
    const offered = options.map(
      (option) => `${option.level}:${option.scope_id}`,
    );

    expect(offered).toEqual([
      `ward:${WARD_01}`,
      `polling_unit:${PU_001}`,
      `polling_unit:${PU_002}`,
    ]);

    expect(offered).not.toContain(`ward:${WARD_02}`);
    expect(offered).not.toContain(`lga:${LGA}`);
    expect(offered).not.toContain(`state:enugu-state`);
  });

  it("a ward coordinator cannot see another ward's issues", async () => {
    const db = authAs("ward-coord");
    const grants = grantsFor({
      uid: "ward-coord",
      pu: PU_001,
      ward: WARD_01,
      lga: LGA,
      position: "ward_coordinator",
      scope: WARD_01,
    });

    const scope = await resolveCampaignScope("ward", WARD_01, LGAS);
    const issues = await getIssuesInScope(scope, grants, { db });

    expect(ids(issues)).not.toContain("issue-other-ward");
    expect(ids(issues)).not.toContain("issue-other-pu");

    /* And the in-memory narrowing agrees. */
    expect(scopeContainsTarget(scope, "ward", WARD_02)).toBe(false);
  });

  it("a plain member has no filter and sees only their own issues", async () => {
    const db = authAs("chika");
    const grants = grantsFor({
      uid: "chika",
      pu: PU_001,
      ward: WARD_01,
      lga: LGA,
    });

    /* No manage_issue grant -> the picker is not rendered at all. */
    expect(writableScopes(grants, "manage_issue", LGAS)).toEqual([]);

    const scope = await resolveCampaignScope("polling_unit", PU_001, LGAS);
    expect(await getIssuesInScope(scope, grants, { db })).toEqual([]);

    await assertSucceeds(
      getDocs(
        query(
          collection(db, "issues"),
          where("raised_by", "==", "chika"),
        ),
      ),
    );
  });
});
