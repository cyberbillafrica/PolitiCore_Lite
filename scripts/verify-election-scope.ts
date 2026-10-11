/*
 * ============================================================
 * ELECTION SCOPE + ASSIGNMENT HIERARCHY VERIFICATION
 * ============================================================
 *
 * Plain-node assertions (no test runner is configured in this
 * project). Run with:
 *
 *   node scripts/verify-election-scope.ts
 *
 * Exits non-zero when any assertion fails.
 */

import {
  assignmentCoversScope,
  isScopeDescendant,
} from "../src/lib/permissions.ts";
import {
  contestCoversPollingUnit,
  contestCoversWard,
  deriveLgaIdFromWard,
  describeContestScope,
  isWithinContestScope,
  lgasWithinContestScope,
  resolveContestLgaIds,
} from "../src/lib/election-scope.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.error(`[FAIL] ${name}`);
  }
}

/* ----- electoral hierarchy fixtures (shape of LGA / Ward / PollingUnit) -- */

const fakeLGAs = [
  {
    id: "nkanu-west",
    code: "NW",
    name: "Nkanu West",
    wards: [
      {
        id: "nkanu-west-ward-01",
        code: "01",
        name: "Agbani",
        pollingUnits: [
          { id: "nkanu-west-ward-01-pu-001", code: "001", name: "PU 1" },
          { id: "nkanu-west-ward-01-pu-002", code: "002", name: "PU 2" },
        ],
      },
      {
        id: "nkanu-west-ward-02",
        code: "02",
        name: "Akpugo",
        pollingUnits: [
          { id: "nkanu-west-ward-02-pu-001", code: "001", name: "PU 1" },
        ],
      },
    ],
  },
  {
    id: "nsukka",
    code: "NS",
    name: "Nsukka",
    wards: [
      {
        id: "nsukka-ward-01",
        code: "01",
        name: "Nsukka I",
        pollingUnits: [{ id: "nsukka-ward-01-pu-001", code: "001", name: "PU 1" }],
      },
    ],
  },
] as never;

const wardAssignment = {
  id: "a1",
  user_id: "u1",
  position: "ward_coordinator",
  scope_type: "ward",
  scope_id: "nkanu-west-ward-01",
  status: "active",
  assigned_by: "admin",
} as never;

const lgaAssignment = {
  id: "a2",
  user_id: "u2",
  position: "lga_coordinator",
  scope_type: "lga",
  scope_id: "nkanu-west",
  status: "active",
  assigned_by: "admin",
} as never;

/* ----- 1. ward -> polling unit hierarchy (success criterion 8) ---------- */

assert(
  isScopeDescendant(
    { scope_type: "ward", scope_id: "nkanu-west-ward-01" },
    { scope_type: "polling_unit", scope_id: "nkanu-west-ward-01-pu-001" },
    fakeLGAs,
  ) === true,
  "isScopeDescendant: ward covers its child polling unit",
);

assert(
  assignmentCoversScope(
    wardAssignment,
    { scope_type: "polling_unit", scope_id: "nkanu-west-ward-01-pu-002" },
    fakeLGAs,
  ) === true,
  "assignmentCoversScope: ward-scoped assignment covers a child polling unit",
);

assert(
  assignmentCoversScope(
    wardAssignment,
    { scope_type: "polling_unit", scope_id: "nsukka-ward-01-pu-001" },
    fakeLGAs,
  ) === false,
  "assignmentCoversScope: ward-scoped assignment does NOT cover another ward's polling unit",
);

assert(
  assignmentCoversScope(
    wardAssignment,
    { scope_type: "ward", scope_id: "nkanu-west-ward-02" },
    fakeLGAs,
  ) === false,
  "assignmentCoversScope: ward-scoped assignment does NOT cover an unrelated ward",
);

/* ----- 2. lga -> ward -> polling unit ---------------------------------- */

assert(
  assignmentCoversScope(
    lgaAssignment,
    { scope_type: "ward", scope_id: "nkanu-west-ward-02" },
    fakeLGAs,
  ) === true,
  "assignmentCoversScope: LGA assignment covers its child ward",
);

assert(
  assignmentCoversScope(
    lgaAssignment,
    { scope_type: "polling_unit", scope_id: "nkanu-west-ward-02-pu-001" },
    fakeLGAs,
  ) === true,
  "assignmentCoversScope: LGA assignment covers a descendant polling unit",
);

assert(
  assignmentCoversScope(
    lgaAssignment,
    { scope_type: "polling_unit", scope_id: "nsukka-ward-01-pu-001" },
    fakeLGAs,
  ) === false,
  "assignmentCoversScope: LGA assignment does NOT cover another LGA",
);

/* ----- 3. backwards compatibility for two-argument callers -------------- */

assert(
  assignmentCoversScope(wardAssignment, {
    scope_type: "ward",
    scope_id: "nkanu-west-ward-01",
  }) === true,
  "assignmentCoversScope: two-argument call still matches an exact scope",
);

assert(
  assignmentCoversScope(wardAssignment, undefined) === true,
  "assignmentCoversScope: an absent scope is unrestricted (unchanged behaviour)",
);

assert(
  assignmentCoversScope(
    wardAssignment,
    { scope_type: "polling_unit", scope_id: "nkanu-west-ward-01-pu-001" },
    undefined,
  ) === true,
  "assignmentCoversScope: without LGA data the id-prefix fallback still links a ward to its PU",
);

assert(
  assignmentCoversScope(
    wardAssignment,
    { scope_type: "polling_unit", scope_id: "somewhere-else-pu-009" },
    undefined,
  ) === false,
  "assignmentCoversScope: without LGA data an unrelated polling unit is rejected",
);

/* ----- 4. contest -> scope derivation ---------------------------------- */

const stateContest = {
  id: "c1",
  scope_type: "state",
  scope_id: "enugu-state",
} as never;

const lgaContest = {
  id: "c2",
  scope_type: "lga",
  scope_id: "nsukka",
} as never;

const constituencyContest = {
  id: "c3",
  scope_type: "state_constituency",
  scope_id: "nkanu-west-constituency",
  lga_ids: ["nkanu-west"],
} as never;

const unconfiguredConstituency = {
  id: "c4",
  scope_type: "state_constituency",
  scope_id: "somewhere",
} as never;

assert(
  resolveContestLgaIds(stateContest) === null,
  "resolveContestLgaIds: a state-wide contest imposes no LGA restriction",
);

assert(
  JSON.stringify(resolveContestLgaIds(lgaContest)) === JSON.stringify(["nsukka"]),
  "resolveContestLgaIds: a single-LGA contest is restricted to its LGA",
);

assert(
  JSON.stringify(resolveContestLgaIds(constituencyContest)) ===
    JSON.stringify(["nkanu-west"]),
  "resolveContestLgaIds: a constituency contest uses its configured lga_ids",
);

assert(
  resolveContestLgaIds(unconfiguredConstituency) === null,
  "resolveContestLgaIds: an unconfigured constituency must not exclude everything",
);

assert(
  isWithinContestScope(lgaContest, { lgaId: "nsukka" }, fakeLGAs) === true &&
    isWithinContestScope(lgaContest, { lgaId: "nkanu-west" }, fakeLGAs) === false,
  "isWithinContestScope: honours the active contest's LGA boundary",
);

assert(
  isWithinContestScope(stateContest, { lgaId: "anything" }, fakeLGAs) === true,
  "isWithinContestScope: a state-wide contest accepts every LGA",
);

assert(
  contestCoversWard(
    constituencyContest,
    "nkanu-west",
    "nkanu-west-ward-02",
    fakeLGAs,
  ) === true,
  "contestCoversWard: accepts a ward inside the contest scope",
);

assert(
  contestCoversPollingUnit(
    constituencyContest,
    "nsukka",
    "nsukka-ward-01",
    "nsukka-ward-01-pu-001",
    fakeLGAs,
  ) === false,
  "contestCoversPollingUnit: rejects a polling unit outside the contest scope",
);

assert(
  lgasWithinContestScope(constituencyContest, fakeLGAs).length === 1,
  "lgasWithinContestScope: narrows the selectable LGAs to the contest scope",
);

/* ----- 5. no LGA is ever assumed -------------------------------------- */

assert(
  deriveLgaIdFromWard(fakeLGAs, "nsukka-ward-01") === "nsukka",
  "deriveLgaIdFromWard: resolves the owning LGA from the registered ward",
);

assert(
  deriveLgaIdFromWard(fakeLGAs, "unknown-ward-99") === "",
  "deriveLgaIdFromWard: returns empty instead of falling back to a fixed LGA",
);

assert(
  deriveLgaIdFromWard(fakeLGAs, undefined) === "",
  "deriveLgaIdFromWard: returns empty for a member with no registered ward",
);

assert(
  describeContestScope(stateContest, fakeLGAs).includes("Enugu State"),
  "describeContestScope: labels a state-wide contest",
);

assert(
  describeContestScope(lgaContest, fakeLGAs) === "Nsukka (LGA)",
  "describeContestScope: labels a single-LGA contest with the LGA name",
);

console.log(
  `\n==================================================\nTEST SUMMARY: ${passed} passed, ${failed} failed\n==================================================`,
);

process.exit(failed > 0 ? 1 : 0);
