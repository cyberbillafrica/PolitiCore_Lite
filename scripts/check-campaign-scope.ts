/*
 * Regression check (run: npx tsx scripts/check-campaign-scope.ts).
 *
 * Round 5 makes every campaign page use the election engine's scope
 * model. These assertions pin the behaviour that model depends on:
 *
 *   - the zone vocabulary is `senatorial_zone` with the dataset ids
 *     (enugu-east / enugu-north / enugu-west), not "-zone" suffixes
 *   - a senatorial zone covers the LGAs inside it and NOT the state
 *     (this was a real bug: the old resolver returned true for any
 *     LGA once the source was a zone)
 *   - a polling-unit coordinator covers exactly their own polling unit
 *   - a plain member's authority is their registered polling unit and
 *     it is NOT a coordinator scope
 *   - plain members cannot create campaign work; PU coordinators can
 *   - zone -> LGA membership comes from the constituency reference
 */
import { nkanuWestElectoralData } from "../src/data/electoral";
import {
  canCreateAtScope,
  describeScope,
  positionScopeLevel,
  resolveCampaignAuthority,
  zoneIdForLga,
} from "../src/lib/campaign-scope";
import { assignmentCoversScope, hasPermission, isScopeDescendant } from "../src/lib/permissions";
import type {
  LGA,
  OrganizationalAssignment,
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

/*
 * The bundled dataset only carries Nkanu West's wards; wrap them in the
 * LGA shell the resolver expects.
 */
const lgas: LGA[] = [
  {
    id: "nkanu-west",
    code: "NW",
    name: "Nkanu West",
    wards: nkanuWestElectoralData,
  },
];
const nkanuWest = lgas[0];
const ward01 = nkanuWest.wards[0];
const ward02 = nkanuWest.wards[1];
const puInWard01 = ward01.pollingUnits[0];
const puInWard02 = ward02.pollingUnits[0];

function assignment(
  position: OrganizationalAssignment["position"],
  scope_type: OrganizationalAssignment["scope_type"],
  scope_id: string,
): OrganizationalAssignment {
  return {
    id: `${position}-${scope_id}`,
    user_id: "user-1",
    position,
    scope_type,
    scope_id,
    status: "active",
    assigned_by: "admin",
  };
}

/* ------------------------------------------------------------
 * 1. Zone vocabulary and membership
 * ------------------------------------------------------------ */

check("zone id for nkanu-west", zoneIdForLga("nkanu-west"), "enugu-east");
check("zone id for nsukka", zoneIdForLga("nsukka"), "enugu-north");
check("zone id for aniNri casing", zoneIdForLga("Aninri"), "enugu-west");
check("unknown LGA has no zone", zoneIdForLga("not-an-lga"), "");

check(
  "zone covers an LGA inside it",
  isScopeDescendant(
    { scope_type: "senatorial_zone", scope_id: "enugu-east" },
    { scope_type: "lga", scope_id: "nkanu-west" },
    lgas,
  ),
  true,
);

check(
  "zone does NOT cover an LGA in another zone",
  isScopeDescendant(
    { scope_type: "senatorial_zone", scope_id: "enugu-east" },
    { scope_type: "lga", scope_id: "nsukka" },
    lgas,
  ),
  false,
);

check(
  "zone does not match a different zone",
  isScopeDescendant(
    { scope_type: "senatorial_zone", scope_id: "enugu-east" },
    { scope_type: "senatorial_zone", scope_id: "enugu-west" },
    lgas,
  ),
  false,
);

/* ------------------------------------------------------------
 * 2. Assignment coverage
 * ------------------------------------------------------------ */

const wardCoord = assignment("ward_coordinator", "ward", ward01.id);

check(
  "ward coordinator covers a PU inside their ward",
  assignmentCoversScope(
    wardCoord,
    { scope_type: "polling_unit", scope_id: puInWard01.id },
    lgas,
  ),
  true,
);

check(
  "ward coordinator does not cover a PU in another ward",
  assignmentCoversScope(
    wardCoord,
    { scope_type: "polling_unit", scope_id: puInWard02.id },
    lgas,
  ),
  false,
);

const puCoord = assignment("pu_coordinator", "polling_unit", puInWard01.id);

check(
  "PU coordinator covers their own PU",
  assignmentCoversScope(
    puCoord,
    { scope_type: "polling_unit", scope_id: puInWard01.id },
    lgas,
  ),
  true,
);

check(
  "PU coordinator does not cover their ward",
  assignmentCoversScope(
    puCoord,
    { scope_type: "ward", scope_id: ward01.id },
    lgas,
  ),
  false,
);

const lgaCoord = assignment("lga_coordinator", "lga", nkanuWest.id);

check(
  "LGA coordinator covers a ward in the LGA",
  assignmentCoversScope(
    lgaCoord,
    { scope_type: "ward", scope_id: ward02.id },
    lgas,
  ),
  true,
);

/* ------------------------------------------------------------
 * 3. Effective authority
 * ------------------------------------------------------------ */

const plainMember = {
  id: "member-1",
  full_name: "Plain Member",
  email: "member@example.com",
  access_role: "member",
  membership_types: ["campaign_member"],
  lga_id: nkanuWest.id,
  ward_id: ward01.id,
  polling_unit_id: puInWard01.id,
} as unknown as UserProfile;

const plainAuthority = resolveCampaignAuthority(plainMember, []);

check("plain member level is their PU", plainAuthority.level, "polling_unit");
check("plain member scope id is their PU", plainAuthority.scopeId, puInWard01.id);
check("plain member is not a coordinator", plainAuthority.isCoordinator, false);

const puAuthority = resolveCampaignAuthority(plainMember, [puCoord]);

check("PU coordinator level", puAuthority.level, "polling_unit");
check("PU coordinator is a coordinator", puAuthority.isCoordinator, true);
check(
  "position -> scope level mapping",
  positionScopeLevel("pu_coordinator"),
  "polling_unit",
);

/* ------------------------------------------------------------
 * 4. Creation rules
 * ------------------------------------------------------------ */

const wardCoordProfile = {
  ...plainMember,
  id: "coord-1",
} as UserProfile;

check(
  "ward coordinator may create at a PU in their ward",
  canCreateAtScope(
    wardCoordProfile,
    [wardCoord],
    { level: "polling_unit", scopeId: puInWard01.id },
    lgas,
  ),
  true,
);

check(
  "ward coordinator may NOT create in another ward",
  canCreateAtScope(
    wardCoordProfile,
    [wardCoord],
    { level: "ward", scopeId: ward02.id },
    lgas,
  ),
  false,
);

check(
  "plain member may NOT create at their own PU",
  canCreateAtScope(
    plainMember,
    [assignment("campaign_member", "polling_unit", puInWard01.id)],
    { level: "polling_unit", scopeId: puInWard01.id },
    lgas,
  ),
  false,
);

const adminProfile = {
  ...plainMember,
  access_role: "admin",
} as UserProfile;

check(
  "admin may create anywhere",
  canCreateAtScope(
    adminProfile,
    [],
    { level: "state", scopeId: "enugu-state" },
    lgas,
  ),
  true,
);

/* ------------------------------------------------------------
 * 5. Permission matrix
 * ------------------------------------------------------------ */

const memberContext = {
  profile: plainMember,
  assignments: [assignment("campaign_member", "polling_unit", puInWard01.id)],
  grants: [],
};

check(
  "plain member cannot create activities",
  hasPermission(memberContext, "create_activity"),
  false,
);

check(
  "plain member cannot assign tasks",
  hasPermission(memberContext, "assign_task"),
  false,
);

check(
  "plain member can submit reports",
  hasPermission(memberContext, "submit_field_report"),
  true,
);

const puContext = {
  profile: plainMember,
  assignments: [puCoord],
  grants: [],
};

check(
  "PU coordinator can create activities",
  hasPermission(puContext, "create_activity"),
  true,
);

check(
  "PU coordinator can view members",
  hasPermission(puContext, "view_members"),
  true,
);

check(
  "PU coordinator can manage issues",
  hasPermission(puContext, "manage_issue"),
  true,
);

/* ------------------------------------------------------------
 * 6. Labels
 * ------------------------------------------------------------ */

check(
  "state scope label",
  describeScope("state", "enugu-state", lgas),
  "Enugu State",
);

check(
  "zone scope label",
  describeScope("senatorial_zone", "enugu-east", lgas),
  "Enugu East Senatorial Zone",
);

check(
  "LGA scope label",
  describeScope("lga", nkanuWest.id, lgas),
  `${nkanuWest.name} LGA`,
);

check(
  "PU label falls back to the id when unresolved",
  describeScope("polling_unit", "unknown-pu", lgas),
  "unknown-pu",
);

/* ------------------------------------------------------------
 * RESULT
 * ------------------------------------------------------------ */

console.log(
  `\n${failures === 0 ? "ALL CAMPAIGN SCOPE CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
);

process.exit(failures === 0 ? 0 : 1);
