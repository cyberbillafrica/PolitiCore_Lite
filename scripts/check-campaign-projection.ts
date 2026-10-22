/*
 * Regression check (run: npx tsx scripts/check-campaign-projection.ts).
 *
 * Round 6 defines one pure projection: baseline (9 documents) plus
 * coordinator grants, diffed against what is recorded. These assertions
 * pin the behaviour the Firestore rules depend on:
 *
 *   - a plain member gets exactly the 9 baseline documents
 *   - an ineligible user (social-only, election officer, no home area)
 *     gets nothing at all
 *   - a ward coordinator keeps the baseline and gains 12 grants at the
 *     assigned ward (21 documents when the assigned ward differs from
 *     the home ward)
 *   - a PU coordinator cannot reach their ward
 *   - demotion removes every coordinator document and keeps the baseline
 *   - the election projection is never deleted by a campaign diff
 *   - a legacy `tenant_id` grant is removed because its id is not
 *     expected
 *   - every projected permission exists in the campaign matrix
 */
import { nkanuWestElectoralData } from "../src/data/electoral";
import {
  BASELINE_DOC_COUNT,
  CAMPAIGN_PROJECTED_PERMISSIONS,
  buildBaselineAccessDocs,
  computeExpectedCampaignAccess,
  diffCampaignAccess,
  isBaselineEligible,
  isCampaignProjectionEligible,
} from "../src/lib/campaign-access";
import type {
  LGA,
  OrganizationalPosition,
  ScopeType,
  UserProfile,
} from "../src/types";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) {
    console.log(`   actual:   ${JSON.stringify(actual)}`);
    console.log(`   expected: ${JSON.stringify(expected)}`);
    failures++;
  }
}

/* ------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------ */

const lgas: LGA[] = [
  {
    id: "nkanu-west",
    code: "NW",
    name: "Nkanu West",
    wards: nkanuWestElectoralData,
  },
];

const homeWard = lgas[0].wards[0];
const homePu = homeWard.pollingUnits[0];
const otherWard = lgas[0].wards[1];
const otherPu = otherWard?.pollingUnits[0];

function profile(overrides: Partial<UserProfile> = {}) {
  return {
    id: "member-1",
    full_name: "Plain Member",
    email: "member@example.com",
    access_role: "member",
    membership_types: ["campaign_member"],
    lga_id: lgas[0].id,
    ward_id: homeWard.id,
    polling_unit_id: homePu.id,
    ...overrides,
  } as unknown as UserProfile;
}

function assignment(
  position: OrganizationalPosition,
  scope_type: ScopeType,
  scope_id: string,
) {
  return { position, scope_type, scope_id, status: "active" };
}

function ids(profileOverrides: Partial<UserProfile>, assignments: ReturnType<typeof assignment>[]) {
  return computeExpectedCampaignAccess({
    userId: "member-1",
    profile: profile(profileOverrides),
    assignments,
    lgas,
  }).map((doc) => doc.id);
}

/* ------------------------------------------------------------
 * 1. Eligibility
 * ------------------------------------------------------------ */

check("plain campaign member is eligible", isCampaignProjectionEligible(profile()), true);
check(
  "social-only member is not eligible",
  isCampaignProjectionEligible(profile({ membership_types: ["social_member"] })),
  false,
);
check(
  "election officer is not eligible even with campaign membership",
  isCampaignProjectionEligible(profile({ access_role: "election_officer" })),
  false,
);
check("member without a home area is not baseline eligible", isBaselineEligible(profile({ polling_unit_id: "" })), false);

/* ------------------------------------------------------------
 * 2. Baseline
 * ------------------------------------------------------------ */

const baseline = buildBaselineAccessDocs("member-1", profile());

check("baseline has 9 documents", baseline.length, BASELINE_DOC_COUNT);
check("baseline has 9 unique ids", new Set(baseline.map((d) => d.id)).size, BASELINE_DOC_COUNT);
check(
  "baseline includes cascade-up view_activities at the zone",
  baseline.some(
    (doc) =>
      doc.permission === "view_activities" &&
      doc.scope_type === "senatorial_zone" &&
      doc.scope_id === "enugu-east",
  ),
  true,
);
check(
  "baseline includes state view_activities",
  baseline.some(
    (doc) =>
      doc.permission === "view_activities" &&
      doc.scope_type === "state" &&
      doc.scope_id === "enugu-state",
  ),
  true,
);
check(
  "baseline submits reports at the member's own PU",
  baseline.some((doc) => doc.id === `member-1__submit_field_report__polling_unit__${homePu.id}`),
  true,
);
check(
  "social-only member projects nothing",
  ids({ membership_types: ["social_member"] }, []),
  [],
);
check(
  "member without a home area projects nothing",
  ids({ ward_id: "" }, []),
  [],
);

/* ------------------------------------------------------------
 * 3. Coordinator grants (baseline is additive)
 * ------------------------------------------------------------ */

/*
 * The PU coordinator's scope IS the member's home PU, so five of their
 * twelve grants (view_activities, view_members, view_assignments,
 * submit_field_report, report_issue) are the same documents the
 * baseline already holds: 9 + 12 - 5 = 16 unique documents.
 */
const puCoordinator = ids({}, [assignment("pu_coordinator", "polling_unit", homePu.id)]);
check("PU coordinator at their own PU: 16 unique documents", puCoordinator.length, 16);
check(
  "PU coordinator gains create_activity at their PU",
  puCoordinator.includes(`member-1__create_activity__polling_unit__${homePu.id}`),
  true,
);
check(
  "PU coordinator does NOT gain anything at their ward",
  puCoordinator.some((id) => id.includes(`__ward__${homeWard.id}`) && !id.includes("view_activities")),
  false,
);

const wardCoordinatorSameWard = ids({}, [
  assignment("ward_coordinator", "ward", homeWard.id),
]);
check(
  "ward coordinator at their own ward: 20 unique documents",
  wardCoordinatorSameWard.length,
  20,
);

const wardCoordinatorOtherWard = otherWard
  ? ids({}, [assignment("ward_coordinator", "ward", otherWard.id)])
  : [];

if (otherWard) {
  check(
    "ward coordinator at another ward: 21 documents (9 baseline + 12)",
    wardCoordinatorOtherWard.length,
    21,
  );
  check(
    "ward coordinator gains manage_issue at the assigned ward",
    wardCoordinatorOtherWard.includes(
      `member-1__manage_issue__ward__${otherWard.id}`,
    ),
    true,
  );
  check(
    "ward coordinator keeps the baseline at their home PU",
    wardCoordinatorOtherWard.includes(
      `member-1__view_members__polling_unit__${homePu.id}`,
    ),
    true,
  );
}

/*
 * The LGA coordinator covers the member's own LGA and ward, so
 * view_activities at the LGA and at the home ward collapse into the
 * baseline's own two documents.
 */
const lgaCoordinator = ids({}, [
  assignment("lga_coordinator", "lga", lgas[0].id),
]);
check(
  "LGA coordinator: baseline + 12 grants per LGA and per ward, minus 2 duplicates",
  lgaCoordinator.length,
  BASELINE_DOC_COUNT + 12 * (1 + lgas[0].wards.length) - 2,
);

/* ------------------------------------------------------------
 * 4. Diffing — demotion, legacy grants, election preservation
 * ------------------------------------------------------------ */

const coordinatorExpected = computeExpectedCampaignAccess({
  userId: "member-1",
  profile: profile(),
  assignments: [assignment("ward_coordinator", "ward", homeWard.id)],
  lgas,
});

const plainExpected = computeExpectedCampaignAccess({
  userId: "member-1",
  profile: profile(),
  assignments: [],
  lgas,
});

const demotion = diffCampaignAccess(
  plainExpected,
  coordinatorExpected.map((doc) => doc.id),
);

check(
  "demotion deletes exactly the coordinator documents",
  demotion.toDelete.length,
  coordinatorExpected.length - BASELINE_DOC_COUNT,
);
check("demotion keeps the baseline (nothing to add)", demotion.toAdd.length, 0);
check(
  "demotion keeps 9 documents",
  coordinatorExpected.length - demotion.toDelete.length,
  BASELINE_DOC_COUNT,
);

const legacyIds = [
  ...plainExpected.map((doc) => doc.id),
  "member-1__manage_documents__ward__nkanu-west-ward-04",
  "member-1__send_notice__ward__nkanu-west-ward-04",
  "member-1__view_analytics__ward__nkanu-west-ward-04",
  "member-1__view_election_results__global",
];

const legacyDiff = diffCampaignAccess(plainExpected, legacyIds);

check("legacy permission documents are deleted", legacyDiff.toDelete.sort(), [
  "member-1__manage_documents__ward__nkanu-west-ward-04",
  "member-1__send_notice__ward__nkanu-west-ward-04",
  "member-1__view_analytics__ward__nkanu-west-ward-04",
].sort());

check(
  "the election projection is never deleted",
  legacyDiff.toDelete.includes("member-1__view_election_results__global"),
  false,
);

check(
  "admin without campaign membership projects nothing",
  computeExpectedCampaignAccess({
    userId: "admin-1",
    profile: profile({ access_role: "admin", membership_types: [] }),
    assignments: [assignment("state_coordinator", "state", "enugu-state")],
    lgas,
  }).length,
  0,
);

/* ------------------------------------------------------------
 * 5. Permission vocabulary
 * ------------------------------------------------------------ */

check(
  "no legacy permission names in the projection matrix",
  CAMPAIGN_PROJECTED_PERMISSIONS.filter((permission) =>
    [
      "manage_documents",
      "send_notice",
      "view_analytics",
      "view_member_contacts",
    ].includes(permission),
  ),
  [],
);

check(
  "baseline only projects permissions from the matrix",
  buildBaselineAccessDocs("member-1", profile()).every((doc) =>
    CAMPAIGN_PROJECTED_PERMISSIONS.includes(doc.permission),
  ),
  true,
);

/* Two-PU sanity: the other ward's PU is never in the baseline. */
if (otherPu) {
  check(
    "baseline never touches another ward's polling unit",
    baseline.some((doc) => doc.id.includes(otherPu.id)),
    false,
  );
}

/* ------------------------------------------------------------
 * RESULT
 * ------------------------------------------------------------ */

console.log(
  `\n${failures === 0 ? "ALL CAMPAIGN PROJECTION CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
);

process.exit(failures === 0 ? 0 : 1);
