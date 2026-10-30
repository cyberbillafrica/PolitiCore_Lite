import type {
  ElectionContest,
  LGA,
  OrganizationalAssignment,
  ScopeType,
} from "@/types";

/*
 * ============================================================
 * ELECTION RESULT LEVELS (EC8A / EC8B / EC8C / EC8D)
 * ============================================================
 *
 * A result document now carries a `result_level`:
 *
 *   polling_unit -> EC8A, the polling-unit result (legacy docs omit it)
 *   ward         -> EC8B, the ward collation
 *   lga          -> EC8C, the LGA collation
 *   state        -> EC8D, the state collation
 *
 * Legacy documents (written before this round) have no field and MUST
 * keep being treated as polling-unit results. `getResultLevel()` is the
 * single place that default lives.
 */

export type ElectionResultLevel = "polling_unit" | "ward" | "lga" | "state";

export const RESULT_LEVELS: ElectionResultLevel[] = [
  "polling_unit",
  "ward",
  "lga",
  "state",
];

export interface ResultLevelMeta {
  level: ElectionResultLevel;
  label: string;
  shortLabel: string;
  formCode: "EC8A" | "EC8B" | "EC8C" | "EC8D";
  entityNoun: string;
}

const LEVEL_META: Record<ElectionResultLevel, ResultLevelMeta> = {
  polling_unit: {
    level: "polling_unit",
    label: "Polling Unit",
    shortLabel: "PU",
    formCode: "EC8A",
    entityNoun: "polling unit",
  },
  ward: {
    level: "ward",
    label: "Ward",
    shortLabel: "Ward",
    formCode: "EC8B",
    entityNoun: "ward",
  },
  lga: {
    level: "lga",
    label: "LGA",
    shortLabel: "LGA",
    formCode: "EC8C",
    entityNoun: "LGA",
  },
  state: {
    level: "state",
    label: "State",
    shortLabel: "State",
    formCode: "EC8D",
    entityNoun: "state",
  },
};

export function resultLevelMeta(level: ElectionResultLevel): ResultLevelMeta {
  return LEVEL_META[level];
}

/** Legacy docs (no `result_level`) are polling-unit results. */
export function getResultLevel(doc: {
  result_level?: string | null;
} | null | undefined): ElectionResultLevel {
  const value = doc?.result_level;
  return value === "ward" || value === "lga" || value === "state"
    ? value
    : "polling_unit";
}

/**
 * Tabs the dashboard may show for the ACTIVE contest.
 *
 *   state-wide ............ PU, Ward, LGA, State (EC8D only exists here)
 *   >= 2 LGAs ............. PU, Ward, LGA
 *   single LGA ............ PU, Ward
 *   ward / PU contest ..... PU
 *
 * No active contest -> no tabs (the dashboard keeps its old single view).
 */
export function visibleResultLevels(
  contest: ElectionContest | null | undefined,
  contestLgaIds: string[] | null | undefined,
): ElectionResultLevel[] {
  if (!contest) return [];

  /* Firestore may carry legacy scopes ("lga", "ward", "polling_unit")
   * even though ContestScopeType no longer names them. */
  const scopeType: string = contest.scope_type;

  if (scopeType === "state") return [...RESULT_LEVELS];
  if (scopeType === "lga") return ["polling_unit", "ward"];
  if (scopeType === "ward" || scopeType === "polling_unit") {
    return ["polling_unit"];
  }

  /*
   * national and the constituency scopes cover at least two LGAs (or
   * have no resolved LGA restriction at all). EC8D does not apply to
   * them, so the State tab is hidden.
   */
  if (
    scopeType === "national" ||
    contestLgaIds === null ||
    contestLgaIds === undefined ||
    contestLgaIds.length >= 2
  ) {
    return ["polling_unit", "ward", "lga"];
  }

  return ["polling_unit", "ward"];
}

/** Totals for the completion strip, from the in-memory hierarchy. */
export function countHierarchyTargets(
  lgas: LGA[],
): Record<ElectionResultLevel, number> {
  return {
    polling_unit: lgas.reduce(
      (total, lga) =>
        total +
        lga.wards.reduce(
          (wardTotal, ward) => wardTotal + ward.pollingUnits.length,
          0,
        ),
      0,
    ),
    ward: lgas.reduce((total, lga) => total + lga.wards.length, 0),
    lga: lgas.length,
    state: 1,
  };
}

/**
 * Approved-document count per level for one contest. Rows from other
 * contests are ignored; legacy rows count as polling-unit results.
 */
export function countApprovedByLevel(
  results: Array<{
    contest_id?: string;
    status?: string;
    result_level?: string | null;
  }>,
  contestId: string,
): Record<ElectionResultLevel, number> {
  const counts: Record<ElectionResultLevel, number> = {
    polling_unit: 0,
    ward: 0,
    lga: 0,
    state: 0,
  };

  for (const result of results) {
    if (result.contest_id !== contestId) continue;
    if (result.status !== "approved") continue;
    counts[getResultLevel(result)] += 1;
  }

  return counts;
}

/**
 * Levels the signed-in caller may submit.
 *
 * The rules remain the source of truth; this only decides which forms
 * to show so the uploader never offers a level the rules would deny.
 */
export function availableUploadLevels(input: {
  isAdminOrElectionOfficer: boolean;
  assignments: Array<
    Pick<OrganizationalAssignment, "position" | "scope_type" | "status">
  >;
  contest: ElectionContest | null | undefined;
}): ElectionResultLevel[] {
  const levels: ElectionResultLevel[] = ["polling_unit"];
  const contest = input.contest;
  if (!contest) return levels;

  if (input.isAdminOrElectionOfficer) {
    levels.push("ward", "lga");
    if (contest.scope_type === "state") levels.push("state");
    return levels;
  }

  const uploadPositions = new Set([
    "ward_coordinator",
    "lga_coordinator",
    "zone_coordinator",
    "state_coordinator",
    "campaign_manager",
    "council_chairman",
  ]);

  const coordinatorAssignments = input.assignments.filter(
    (assignment) =>
      assignment.status === "active" &&
      uploadPositions.has(assignment.position),
  );

  if (coordinatorAssignments.length === 0) return levels;

  levels.push("ward");

  const lgaScoped: ScopeType[] = [
    "lga",
    "senatorial_zone",
    "state",
    "campaign",
  ];
  if (
    coordinatorAssignments.some((assignment) =>
      lgaScoped.includes(assignment.scope_type),
    )
  ) {
    levels.push("lga");
  }

  const stateScoped: ScopeType[] = ["state", "campaign"];
  if (
    contest.scope_type === "state" &&
    coordinatorAssignments.some((assignment) =>
      stateScoped.includes(assignment.scope_type),
    )
  ) {
    levels.push("state");
  }

  return levels;
}
