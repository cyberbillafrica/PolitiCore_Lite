/*
 * Regression check (run: npx tsx scripts/check-contest-scope.ts).
 *
 * Contest scope resolution must pin the "Enugu North and South
 * Federal Constituency" contest to the two LGAs it covers — not
 * widen to the whole state — and must never guess beyond the
 * constituency reference.
 */
import {
  lookupConstituencyLgaIds,
  normalizeScopeKey,
} from "../src/data/constituencies";
import {
  resolveContestLgaIds,
  describeContestScope,
  lgasWithinContestScope,
} from "../src/lib/election-scope";
import type { ElectionContest, LGA } from "../src/types";

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

const userContest = {
  id: "enugu-north-south-fed",
  election_cycle_id: "general-election-2027",
  contest_type: "federal_house",
  name: "Enugu North and South Federal Constituency",
  scope_type: "federal_constituency",
  scope_id: "enugu-north-south",
  status: "OPEN",
  collation_status: "IN_PROGRESS",
  tracked_parties: ["ndc", "adc", "pdp", "apc"],
  created_by: "admin",
} as ElectionContest;

// 1. The reference resolves the user's contest name to the two LGAs.
check(
  "lookup by name (user's contest)",
  lookupConstituencyLgaIds(userContest),
  ["enugu-north", "enugu-south"],
);

// 2. resolveContestLgaIds falls back to the reference for legacy rows
//    (no lga_ids stored).
check(
  "resolveContestLgaIds legacy row (no lga_ids)",
  resolveContestLgaIds(userContest),
  ["enugu-north", "enugu-south"],
);

// 3. Explicit lga_ids always wins over the reference.
check(
  "resolveContestLgaIds explicit lga_ids wins",
  resolveContestLgaIds({
    ...userContest,
    lga_ids: ["enugu-south"],
  } as ElectionContest),
  ["enugu-south"],
);

// 4. Scope description names the two LGAs instead of "Unrestricted".
const allLgas = [
  { id: "enugu-north", code: "EN", name: "Enugu North", wards: [] },
  { id: "enugu-south", code: "ES", name: "Enugu South", wards: [] },
  { id: "nsukka", code: "NS", name: "Nsukka", wards: [] },
] as unknown as LGA[];

check(
  "describeContestScope names the LGAs",
  describeContestScope(userContest, allLgas),
  "Enugu North / Enugu South",
);

// 5. The LGA filter list is limited to the contest's LGAs.
check(
  "lgasWithinContestScope limits the filter list",
  lgasWithinContestScope(userContest, allLgas).map((l) => l.id),
  ["enugu-north", "enugu-south"],
);

// 6. The scope-id normalization also matches slug-style scope_ids.
check(
  "lookup by slug scope_id",
  lookupConstituencyLgaIds({
    scope_type: "federal_constituency",
    scope_id: "nkanu-east-west-fed",
    name: "2027 Nkanu East / Nkanu West Federal Constituency Election",
  }),
  ["nkanu-east", "nkanu-west"],
);

// 7. Unknown constituencies must NOT resolve (never guess).
check(
  "unknown constituency resolves to []",
  lookupConstituencyLgaIds({
    scope_type: "state_constituency",
    scope_id: "somewhere",
    name: "Somewhere State Constituency",
  }),
  [],
);

// 8. An unconfigured, unreferenceable contest stays unrestricted.
check(
  "unconfigured contest stays unrestricted",
  resolveContestLgaIds({
    ...userContest,
    scope_type: "state_constituency",
    name: "Somewhere State Constituency",
    scope_id: "somewhere",
  } as ElectionContest),
  null,
);

// 9. Word-set normalization is order/separator insensitive.
check(
  "normalizeScopeKey order-insensitive",
  [
    normalizeScopeKey("Enugu North and South Federal Constituency"),
    normalizeScopeKey("South/North Enugu FED"),
  ],
  ["enugu north south", "enugu north south"],
);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll contest-scope checks passed.");
