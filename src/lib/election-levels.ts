import type {
  ElectionContest,
  EnuguStateElectoralData,
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

/*
 * ============================================================
 * COLLATION DISCREPANCY DETECTION (Round 16B)
 * ============================================================
 *
 * A collation is compared with the sum of its APPROVED children:
 *
 *   EC8B ward  -> approved EC8A polling-unit results in that ward
 *   EC8C LGA   -> approved EC8B ward collations in that LGA
 *   EC8D state -> approved EC8C LGA collations in that state
 *
 * Discrepancy is display-only: it never blocks a review. It is also
 * flagged only when coverage is COMPLETE — an incomplete collation is
 * pending coverage, not a mismatch.
 *
 * Legacy documents (no `result_level`) are polling-unit results and
 * therefore count as children of their ward. They are never treated as
 * collations themselves.
 */

/**
 * Structural input for the comparisons. `ElectionResultDoc` and the
 * lighter `ElectionResultRecord` both satisfy it, so the upload page's
 * pre-check rows can be compared without a cast.
 */
export interface ComparisonResultInput {
  contest_id?: string;
  result_level?: string | null;
  ward_id?: string;
  lga_id?: string;
  state_id?: string | null;
  status?: string;
  results: Array<{ party: string; votes: number }>;
}

export interface PartyComparison {
  party: string;
  /** Votes recorded on the collation document. */
  submitted: number;
  /** Sum of the approved child results. */
  aggregated: number;
  /** `submitted - aggregated`. */
  difference: number;
  isDiscrepant: boolean;
}

export interface CollationComparison {
  resultLevel: "ward" | "lga" | "state";
  /** ward_id, lga_id, or state_id. */
  scopeId: string;
  submittedTotal: number;
  aggregatedTotal: number;
  perParty: PartyComparison[];
  /** Children the hierarchy says exist (PUs, wards, or LGAs). */
  childCount: number;
  childApprovedCount: number;
  isComplete: boolean;
  hasDiscrepancy: boolean;
}

export interface ChildAggregationPreview {
  /** Normalised party key (upper case) -> aggregated votes. */
  perParty: Record<string, number>;
  childCount: number;
  childApprovedCount: number;
}

const COLLATION_LEVELS = ["ward", "lga", "state"] as const;
export type CollationLevel = (typeof COLLATION_LEVELS)[number];

function isCollationLevel(value: ElectionResultLevel): value is CollationLevel {
  return value === "ward" || value === "lga" || value === "state";
}

function childLevelOf(level: CollationLevel): ElectionResultLevel {
  if (level === "ward") return "polling_unit";
  if (level === "lga") return "ward";
  return "lga";
}

function normaliseParty(value: string): string {
  return value.trim().toUpperCase();
}

function normaliseId(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Number of children the hierarchy says exist at this level. */
function hierarchyChildCount(
  level: CollationLevel,
  scopeId: string,
  hierarchy: EnuguStateElectoralData,
): number {
  const id = normaliseId(scopeId);
  if (!id) return 0;

  if (level === "ward") {
    for (const lga of hierarchy.lgas) {
      const ward = lga.wards.find((item) => normaliseId(item.id) === id);
      if (ward) return ward.pollingUnits.length;
    }
    return 0;
  }

  if (level === "lga") {
    const lga = hierarchy.lgas.find((item) => normaliseId(item.id) === id);
    return lga ? lga.wards.length : 0;
  }

  /* EC8D: every LGA in the state hierarchy is a child. */
  return hierarchy.lgas.length;
}

function isChildOf(
  child: ComparisonResultInput,
  level: CollationLevel,
  scopeId: string,
): boolean {
  if (getResultLevel(child) !== childLevelOf(level)) return false;

  const id = normaliseId(scopeId);
  if (!id) return false;

  if (level === "ward") return normaliseId(child.ward_id) === id;
  if (level === "lga") return normaliseId(child.lga_id) === id;
  return normaliseId(child.state_id) === id;
}

function aggregateParties(
  documents: ComparisonResultInput[],
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const document of documents) {
    for (const entry of document.results ?? []) {
      const party = normaliseParty(String(entry.party ?? ""));
      if (!party) continue;
      const votes = Number(entry.votes) || 0;
      totals[party] = (totals[party] ?? 0) + votes;
    }
  }

  return totals;
}

function collationScopeId(
  level: CollationLevel,
  collation: ComparisonResultInput,
): string {
  if (level === "ward") return collation.ward_id ?? "";
  if (level === "lga") return collation.lga_id ?? "";
  return collation.state_id ?? "";
}

/**
 * Compare one collation with the approved child aggregation.
 *
 * Returns null for polling-unit documents: they are never collations.
 * Unknown wards/LGAs never throw — they simply cannot be marked
 * complete, so they cannot be marked discrepant.
 */
export function computeCollationComparison(
  collation: ComparisonResultInput,
  allResults: ComparisonResultInput[],
  hierarchy: EnuguStateElectoralData,
): CollationComparison | null {
  const level = getResultLevel(collation);
  if (!isCollationLevel(level)) return null;

  const scopeId = collationScopeId(level, collation);
  const childCount = hierarchyChildCount(level, scopeId, hierarchy);

  const children = allResults.filter(
    (result) =>
      result.status === "approved" &&
      (result.contest_id ?? "") === (collation.contest_id ?? "") &&
      isChildOf(result, level, scopeId),
  );

  const submittedByParty = aggregateParties([collation]);
  const aggregatedByParty = aggregateParties(children);

  const parties = Array.from(
    new Set([
      ...Object.keys(submittedByParty),
      ...Object.keys(aggregatedByParty),
    ]),
  ).sort();

  const perParty: PartyComparison[] = parties.map((party) => {
    const submitted = submittedByParty[party] ?? 0;
    const aggregated = aggregatedByParty[party] ?? 0;
    const difference = submitted - aggregated;

    return {
      party,
      submitted,
      aggregated,
      difference,
      isDiscrepant: difference !== 0,
    };
  });

  const submittedTotal = perParty.reduce(
    (sum, entry) => sum + entry.submitted,
    0,
  );
  const aggregatedTotal = perParty.reduce(
    (sum, entry) => sum + entry.aggregated,
    0,
  );

  const isComplete = childCount > 0 && children.length >= childCount;

  return {
    resultLevel: level,
    scopeId,
    submittedTotal,
    aggregatedTotal,
    perParty,
    childCount,
    childApprovedCount: children.length,
    isComplete,
    hasDiscrepancy: isComplete && perParty.some((entry) => entry.isDiscrepant),
  };
}

/** Rejected/clarification collations are being reworked, not flagged. */
function countsTowardDiscrepancyTotal(status?: string): boolean {
  return (
    !status ||
    status === "submitted" ||
    status === "pending_review" ||
    status === "approved" ||
    status === "reopened"
  );
}

/** Discrepant collations, grouped by level, for the completion strip. */
export function countDiscrepancies(
  results: ComparisonResultInput[],
  hierarchy: EnuguStateElectoralData,
): Record<"ward" | "lga" | "state", number> {
  const counts = { ward: 0, lga: 0, state: 0 };

  for (const result of results) {
    const level = getResultLevel(result);
    if (!isCollationLevel(level)) continue;
    if (!countsTowardDiscrepancyTotal(result.status)) continue;

    const comparison = computeCollationComparison(result, results, hierarchy);
    if (comparison?.hasDiscrepancy) counts[level] += 1;
  }

  return counts;
}

/**
 * Pre-submit hint: what the approved children currently add up to,
 * without a specific collation document. The caller passes the results
 * for ONE contest (the upload target).
 */
export function computeChildAggregationPreview(
  level: CollationLevel,
  scopeId: string,
  allResults: ComparisonResultInput[],
  hierarchy: EnuguStateElectoralData,
): ChildAggregationPreview {
  const children = allResults.filter(
    (result) =>
      result.status === "approved" && isChildOf(result, level, scopeId),
  );

  return {
    perParty: aggregateParties(children),
    childCount: hierarchyChildCount(level, scopeId, hierarchy),
    childApprovedCount: children.length,
  };
}
