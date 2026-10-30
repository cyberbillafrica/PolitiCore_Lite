/*
 * ============================================================
 * ELECTION SCOPE MODEL — SINGLE SOURCE OF TRUTH
 * ============================================================
 *
 * Enugu State as a whole is the domain of this application. The
 * *active contest* — selected in the election control center and
 * stored on the single `election_settings` document as
 * `active_contest_id` — defines the geographic scope of election
 * operations:
 *
 *   getElectionSettings()  -> active_contest_id
 *   getContest(id)         -> { scope_type, scope_id, lga_ids, ... }
 *
 * Nothing in the app may pin an operation to a fixed LGA. Every
 * place that needs a geographic boundary (registration, member
 * add, social-force activities, scoped assignments, result /
 * PU-report / incident submission, review queues) must ask this
 * module instead.
 *
 * Scope types (see ContestScopeType in `src/types`):
 *
 *   national                -> the whole country (no LGA restriction)
 *   state                   -> every LGA in the state (no restriction)
 *   senatorial_zone         -> the LGAs listed on `lga_ids`
 *   federal_constituency    -> the LGAs listed on `lga_ids`
 *   state_constituency      -> the LGAs listed on `lga_ids`
 *   lga                     -> exactly `scope_id` (an LGA id)
 *
 * `resolveContestLgaIds()` returns `null` to mean "no LGA-level
 * restriction" and an array to mean "restricted to these LGAs".
 * An empty array is never returned: a contest that lists no LGAs
 * is treated as unrestricted rather than as excluding everything,
 * which would silently break every operation.
 *
 * Resolution order for zone / constituency contests:
 *
 *   1. the contest's explicit `lga_ids` (set by the admin contest
 *      form — always authoritative)
 *   2. the constituency reference in `src/data/constituencies`,
 *      which knows the real LGA composition of Enugu's
 *      senatorial districts and federal constituencies (covers
 *      contests created before the form captured `lga_ids`)
 *   3. `null` (unrestricted) — never guess beyond what is known
 *
 * Hierarchy used by the scope checks below:
 *
 *   Contest scope
 *     └── LGA  ("lga")
 *           └── Ward  ("ward")
 *                 └── Polling Unit  ("polling_unit")
 */

import { lookupConstituencyLgaIds } from "@/data/constituencies";
import type { ElectionContest, LGA } from "@/types";

/**
 * Resolve the LGA ids a contest is restricted to.
 *
 * Returns `null` when the contest imposes no LGA-level restriction.
 */
export function resolveContestLgaIds(
  contest: ElectionContest | null | undefined,
): string[] | null {
  if (!contest) return null;

  /*
   * Firestore data is untyped, so the scope type is read as a plain
   * string: a stored row may carry a single-LGA scope ("lga") even
   * though ContestScopeType no longer names it.
   */
  const scopeType: string = contest.scope_type;

  switch (scopeType) {
    case "national":
    case "state":
      // State-wide (or wider) contests are not restricted by LGA.
      return null;

    case "lga":
      // A single-LGA contest carries its LGA in scope_id.
      return contest.scope_id ? [contest.scope_id] : null;

    case "senatorial_zone":
    case "federal_constituency":
    case "state_constituency": {
      // These contests span a defined set of LGAs — captured on the
      // contest document by the admin contest form.
      const ids = (contest.lga_ids ?? []).filter(Boolean);
      if (ids.length > 0) return ids;

      /*
       * Legacy rows (created before the form captured the LGA set)
       * fall back to the constituency reference, which knows the
       * real LGA composition of Enugu's constituencies. Without
       * this, a constituency contest would silently widen to the
       * whole state ("All LGAs", every polling unit in Enugu).
       */
      const referenced = lookupConstituencyLgaIds(contest);
      return referenced.length > 0 ? referenced : null;
    }

    default:
      return null;
  }
}

/**
 * True when `lgaId` falls inside the contest's geographic scope.
 */
export function isWithinContestScope(
  contest: ElectionContest | null | undefined,
  target: { lgaId?: string | null },
  allLgas: LGA[] = [],
): boolean {
  const allowed = resolveContestLgaIds(contest);
  if (!allowed) return true;

  if (allLgas.length === 0 && contest?.scope_type === "state") {
    return true;
  }

  const lgaId = (target.lgaId ?? "").trim();
  if (!lgaId) return false;

  return allowed.some((id) => id.toLowerCase() === lgaId.toLowerCase());
}

/**
 * True when the ward lives both inside the contest's scope and
 * inside the supplied LGA.
 */
export function contestCoversWard(
  contest: ElectionContest | null | undefined,
  lgaId: string | null | undefined,
  wardId: string | null | undefined,
  allLgas: LGA[] = [],
): boolean {
  if (!isWithinContestScope(contest, { lgaId }, allLgas)) return false;
  if (!wardId) return false;

  const lga = allLgas.find((item) => item.id === lgaId);
  // Without the hierarchy we can only assert the LGA-level check.
  if (!lga) return true;

  return lga.wards.some((ward) => ward.id === wardId);
}

/**
 * True when the polling unit lives inside the contest's scope.
 */
export function contestCoversPollingUnit(
  contest: ElectionContest | null | undefined,
  lgaId: string | null | undefined,
  wardId: string | null | undefined,
  pollingUnitId: string | null | undefined,
  allLgas: LGA[] = [],
): boolean {
  if (!contestCoversWard(contest, lgaId, wardId, allLgas)) return false;
  if (!pollingUnitId) return false;

  const lga = allLgas.find((item) => item.id === lgaId);
  const ward = lga?.wards.find((item) => item.id === wardId);
  if (!ward) return true;

  return ward.pollingUnits.some((unit) => unit.id === pollingUnitId);
}

/**
 * Find the LGA that owns a ward.
 *
 * Used to place a member inside their registered LGA without ever
 * falling back to a hardcoded one.
 */
export function deriveLgaIdFromWard(
  allLgas: LGA[],
  wardId: string | null | undefined,
): string {
  if (!wardId) return "";

  const lga = allLgas.find((item) =>
    item.wards.some((ward) => ward.id === wardId),
  );

  return lga?.id ?? "";
}

/**
 * The LGAs a member may choose from on a contest-scoped form.
 *
 * Order is preserved from `allLgas` so the dropdown stays stable.
 */
export function lgasWithinContestScope(
  contest: ElectionContest | null | undefined,
  allLgas: LGA[],
): LGA[] {
  const allowed = resolveContestLgaIds(contest);
  if (!allowed) return allLgas;

  const allowedLower = allowed.map((id) => id.toLowerCase());

  return allLgas.filter((lga) => allowedLower.includes(lga.id.toLowerCase()));
}

/**
 * Display label for a ward that keeps the stored id and adds the
 * human-readable name in brackets:
 *
 *   nkanu-west-ward-02 (Owo)
 *
 * Falls back to the bare id when the ward is not in the hierarchy —
 * never `undefined`, never an empty string.
 */
export function wardDisplayLabel(
  lgas: LGA[],
  wardId?: string | null,
): string {
  const id = (wardId ?? "").trim();
  if (!id) return "—";

  for (const lga of lgas) {
    const ward = lga.wards.find((item) => item.id === id);
    if (ward?.name) return `${id} (${ward.name})`;
  }

  return id;
}

/**
 * Display label for an LGA id, e.g. "nkanu-west (Nkanu West)".
 * Falls back to the bare id when the hierarchy is not loaded.
 */
export function lgaDisplayLabel(
  allLgas: LGA[],
  lgaId?: string | null,
): string {
  const id = (lgaId ?? "").trim();
  if (!id) return "—";

  const lga = allLgas.find(
    (item) => item.id.toLowerCase() === id.toLowerCase(),
  );

  return lga?.name ? `${id} (${lga.name})` : id;
}

/**
 * Same idea for a polling unit:
 *
 *   nkanu-west-ward-02-pu-016 (Central School Agbani)
 */
export function pollingUnitDisplayLabel(
  lgas: LGA[],
  wardId: string | null | undefined,
  pollingUnitId?: string | null,
): string {
  const id = (pollingUnitId ?? "").trim();
  if (!id) return "—";

  const ward = lgas
    .flatMap((lga) => lga.wards)
    .find((item) => item.id === (wardId ?? "").trim());

  const pu =
    ward?.pollingUnits.find((item) => item.id === id) ??
    lgas
      .flatMap((lga) => lga.wards)
      .flatMap((item) => item.pollingUnits)
      .find((item) => item.id === id);

  return pu?.name ? `${id} (${pu.name})` : id;
}

/**
 * Human-readable label for a contest's scope, e.g. "Enugu State",
 * "Nkanu West (LGA)", or "Nkanu East / Nkanu West".
 */
export function describeContestScope(
  contest: ElectionContest | null | undefined,
  allLgas: LGA[] = [],
): string {
  if (!contest) return "No active contest";

  const nameFor = (id: string) =>
    allLgas.find((lga) => lga.id.toLowerCase() === id.toLowerCase())?.name ?? id;

  const scopeType: string = contest.scope_type;

  switch (scopeType) {
    case "national":
      return "National";
    case "state":
      return "Enugu State (state-wide)";
    case "lga":
      return `${nameFor(contest.scope_id)} (LGA)`;
    case "senatorial_zone":
    case "federal_constituency":
    case "state_constituency": {
      const ids = resolveContestLgaIds(contest);
      /*
       * "Unrestricted" hid misconfiguration: a constituency contest
       * with no LGA set looked intentional. Call out the gap so an
       * admin fixes the contest instead of trusting the totals.
       */
      if (!ids) return "Not configured (all LGAs shown)";
      return ids.map(nameFor).join(" / ");
    }
    default:
      return contest.scope_id || "Unrestricted";
  }
}
