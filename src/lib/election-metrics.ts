/*
 * ============================================================
 * ELECTION METRICS — GEOGRAPHIC SCOPE (Round 16C)
 * ============================================================
 *
 * The dashboard's cards, party totals, charts, completion strip and
 * discrepancy indicator must all describe the SAME slice of results.
 * The geographic filter is the slice:
 *
 *   selectedLgaId  "all" | LGA id
 *   selectedWardId "all" | ward id
 *
 * Level-aware scoping, because a collation covers a whole area:
 *
 *   EC8A polling unit  -> LGA filter AND ward filter
 *   EC8B ward          -> LGA filter AND ward filter
 *   EC8C LGA           -> LGA filter ONLY (a ward filter never
 *                         narrows an LGA-wide document)
 *   EC8D state         -> always in scope
 *
 * Totals follow the same rule so an approved count can never exceed
 * its denominator:
 *
 *   ward filter -> 7 PUs, 1 ward, 1 LGA, 1 state
 *   LGA filter  -> every PU/ward in that LGA, 1 LGA, 1 state
 *
 * Everything here is pure: no Firestore, no React.
 */

import { lgaIdForResult } from "@/lib/election-read-scope";
import { deriveLgaIdFromWard } from "@/lib/election-scope";
import {
  computeCollationComparison,
  getResultLevel,
  type ComparisonResultInput,
  type ElectionResultLevel,
} from "@/lib/election-levels";

import type { EnuguStateElectoralData, LGA } from "@/types";

export interface GeographicFilter {
  selectedLgaId: string;
  selectedWardId: string;
  /** The hierarchy the filter ids are resolved against. */
  lgas: LGA[];
}

export interface MetricsFilter extends GeographicFilter {
  /**
   * The one contest metrics may include. `null` means no active or
   * selected contest, in which case the caller keeps the old
   * "everything readable" behaviour.
   */
  contestId: string | null;
}

export interface ResolvedGeographicScope {
  /** "" when no LGA level is active. */
  lgaId: string;
  /** "" when no ward level is active. */
  wardId: string;
}

/* `polling_unit_id` is only needed by the metric helpers below. */
export interface MetricsResultInput extends ComparisonResultInput {
  polling_unit_id?: string;
}

export interface VoteAggregate {
  totalVotes: number;
  /** Lower-case party key -> votes; includes tracked parties at 0. */
  partyTotals: Record<string, number>;
}

function normalise(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Resolve "all" selectors to the ids that actually bound the slice. */
export function resolveGeographicScope(
  filter: GeographicFilter,
): ResolvedGeographicScope {
  const wardId = filter.selectedWardId !== "all" ? filter.selectedWardId : "";
  const explicitLga =
    filter.selectedLgaId !== "all" ? filter.selectedLgaId : "";

  return {
    lgaId:
      explicitLga || (wardId ? deriveLgaIdFromWard(filter.lgas, wardId) : ""),
    wardId,
  };
}

/**
 * Level-aware membership test. `level` may be passed when the caller
 * already knows it; otherwise it is derived from the document.
 */
export function isResultInGeographicScope(
  result: ComparisonResultInput,
  filter: GeographicFilter,
  level: ElectionResultLevel = getResultLevel(result),
): boolean {
  const scope = resolveGeographicScope(filter);

  if (!scope.lgaId && !scope.wardId) return true;

  /* EC8D spans the whole state; no geographic selector narrows it. */
  if (level === "state") return true;

  if (scope.lgaId) {
    const resultLgaId = lgaIdForResult(
      filter.lgas,
      result.lga_id,
      result.ward_id,
    );
    if (normalise(resultLgaId) !== normalise(scope.lgaId)) return false;
  }

  /* An LGA collation covers every ward inside it. */
  if (level === "lga") return true;

  if (scope.wardId && normalise(result.ward_id) !== normalise(scope.wardId)) {
    return false;
  }

  return true;
}

/**
 * Filter any result list to the geographic slice, respecting the
 * level-aware rules above. Status and contest are left untouched.
 */
export function filterResultsByGeographicScope<T extends ComparisonResultInput>(
  results: T[],
  filter: GeographicFilter,
): T[] {
  return results.filter((result) =>
    isResultInGeographicScope(result, filter),
  );
}

/**
 * The approved polling-unit set every dashboard metric must use.
 *
 * The contest guard is deliberately metrics-only: when the contest
 * dropdown says "all", the ACTIVE contest is the metric authority, so
 * a second contest sharing the same LGA footprint cannot leak into the
 * cards. Other "all" behaviour on the page is unchanged.
 */
export function filterApprovedResultsForMetrics<
  T extends MetricsResultInput,
>(results: T[], filter: MetricsFilter): T[] {
  return results.filter((result) => {
    if (getResultLevel(result) !== "polling_unit") return false;
    if (result.status !== "approved") return false;

    if (
      filter.contestId &&
      normalise(result.contest_id) !== normalise(filter.contestId)
    ) {
      return false;
    }

    return isResultInGeographicScope(result, filter, "polling_unit");
  });
}

/**
 * A polling unit is covered once. Duplicate documents for the same PU
 * (legacy and current id patterns) must not push coverage past 100%.
 */
export function countApprovedPollingUnits(
  results: MetricsResultInput[],
): number {
  const ids = new Set<string>();
  let withoutId = 0;

  for (const result of results) {
    const id = (result.polling_unit_id ?? "").trim();
    if (id) ids.add(id);
    else withoutId += 1;
  }

  return ids.size + withoutId;
}

/** Sum approved votes, keeping tracked parties visible at zero. */
export function aggregatePartyVotes(
  results: ComparisonResultInput[],
  trackedParties: string[] = [],
): VoteAggregate {
  const partyTotals: Record<string, number> = {};
  for (const party of trackedParties) {
    partyTotals[party.toLowerCase()] = 0;
  }

  let totalVotes = 0;

  for (const result of results) {
    for (const entry of result.results ?? []) {
      const party = String(entry.party ?? "").toLowerCase();
      if (!party) continue;
      const votes = Number(entry.votes) || 0;
      totalVotes += votes;
      partyTotals[party] = (partyTotals[party] ?? 0) + votes;
    }
  }

  return { totalVotes, partyTotals };
}

export interface CompletionTotalsOptions extends GeographicFilter {
  /** Contest/viewer totals before the geographic drill-down. */
  totals: Record<ElectionResultLevel, number>;
  /** The viewer is locked to specific polling units; never widen that. */
  pollingUnitLocked?: boolean;
}

/**
 * Denominator for the strip, narrowed to the selected slice with the
 * same level semantics as the rows: a ward filter leaves exactly one
 * ward and its parent LGA, plus the one state document.
 */
export function scopeCompletionTotals(
  options: CompletionTotalsOptions,
): Record<ElectionResultLevel, number> {
  const totals = { ...options.totals };
  const scope = resolveGeographicScope(options);

  if (!scope.lgaId && !scope.wardId) return totals;

  const pollingUnitLocked = options.pollingUnitLocked === true;

  if (scope.wardId) {
    let wardPus = 0;
    let found = false;

    for (const lga of options.lgas) {
      const ward = lga.wards.find(
        (item) => normalise(item.id) === normalise(scope.wardId),
      );
      if (!ward) continue;
      wardPus = ward.pollingUnits.length;
      found = true;
      break;
    }

    if (!found) {
      return {
        polling_unit: 0,
        ward: 0,
        lga: 0,
        state: totals.state,
      };
    }

    return {
      polling_unit: pollingUnitLocked ? totals.polling_unit : wardPus,
      ward: 1,
      lga: 1,
      state: totals.state,
    };
  }

  const lga = options.lgas.find(
    (item) => normalise(item.id) === normalise(scope.lgaId),
  );

  if (!lga) {
    return {
      polling_unit: 0,
      ward: 0,
      lga: 0,
      state: totals.state,
    };
  }

  return {
    polling_unit: pollingUnitLocked
      ? totals.polling_unit
      : lga.wards.reduce((sum, ward) => sum + ward.pollingUnits.length, 0),
    ward: lga.wards.length,
    lga: 1,
    state: totals.state,
  };
}

/* Mirrors election-levels.ts: reworked collations are not flagged. */
function countsTowardDiscrepancyTotal(status?: string): boolean {
  return (
    !status ||
    status === "submitted" ||
    status === "pending_review" ||
    status === "approved" ||
    status === "reopened"
  );
}

/**
 * Discrepant collations inside the geographic slice.
 *
 * `allResults` must stay the FULL contest set: child aggregation needs
 * every child, even one outside the current drill-down. Only the
 * collation being counted is tested against the filter.
 */
export function countDiscrepanciesInScope(
  results: ComparisonResultInput[],
  allResults: ComparisonResultInput[],
  hierarchy: EnuguStateElectoralData,
  filter: GeographicFilter,
): Record<"ward" | "lga" | "state", number> {
  const counts = { ward: 0, lga: 0, state: 0 };

  for (const result of results) {
    const level = getResultLevel(result);
    if (level === "polling_unit") continue;
    if (!countsTowardDiscrepancyTotal(result.status)) continue;
    if (!isResultInGeographicScope(result, filter, level)) continue;

    const comparison = computeCollationComparison(
      result,
      allResults,
      hierarchy,
    );
    if (comparison?.hasDiscrepancy) counts[level] += 1;
  }

  return counts;
}
