/*
 * ============================================================
 * CAMPAIGN READ SCOPE — PURE, FIREBASE-FREE
 * ============================================================
 *
 * Firestore evaluates security rules PER DOCUMENT as a query streams,
 * and it validates the whole query up front: a list read is allowed
 * only when the rules can prove EVERY document it could return is
 * readable. `getDocs(collection(db, "campaign_activities"))` can prove
 * nothing, so the first document outside the caller's scope fails the
 * WHOLE query with "Missing or insufficient permissions" — not a
 * per-document skip.
 *
 * Every campaign read therefore has to be filtered to exactly the
 * (scope_type, scope_id) pairs the caller holds in `user_access`:
 *
 *   rules:  hasAccess("view_activities", resource.data.scope_type,
 *                      resource.data.scope_id)   (firestore.rules)
 *   query:  where("scope_type", "==", type)
 *           where("scope_id", "in", ids)            <- provable
 *
 * This module computes those pairs from the viewer's CURRENT state —
 * the baseline (own PU / ward / LGA / zone / state) plus the scopes of
 * their coordinator assignment — and nothing else. It is deliberately
 * free of Firebase imports so the browser, the tests and the migration
 * scripts all compute the same answer.
 *
 * See docs/campaign-read-queries.md for the per-collection pattern.
 */

import {
  STATE_SCOPE_ID,
  computeExpectedCampaignAccess,
  zoneIdForLga,
  type CampaignAccessAssignment,
  type CampaignAccessProfile,
} from "@/lib/campaign-access";

import type { CampaignScope } from "@/lib/campaign-scope";
import type { LGA, ScopeType } from "@/types";

/** Firestore caps an `in` filter at 30 values. */
export const IN_FILTER_LIMIT = 30;

/**
 * The largest `in` list a scoped campaign read may send — a RULES budget,
 * not the Firestore cap.
 *
 * Firestore charges a list read for every value in the `in` list before
 * it can prove the query. Each `hasScopedAccess()` evaluation costs one
 * `exists()` plus two `get()`s on `user_access`, so a query of N values
 * spends roughly 4N document accesses. Past ~8 values the per-query
 * budget is exhausted and the WHOLE query is denied with "Missing or
 * insufficient permissions" — naming a scope that need not contain a
 * single document. Measured against the emulator: 8 values passed, 9
 * failed, for both `issues` and `campaign_activities`.
 *
 * Six leaves headroom for the rules that evaluate extra clauses per
 * document, and turns an LGA coordinator's 14 wards into 3 queries
 * instead of one denied read.
 */
export const RULES_ACCESS_BUDGET_LIMIT = 6;

/** One (scope_type, scope_id) pair an access document can target. */
export interface ReadScope {
  scope_type: ScopeType | "global";
  scope_id: string;
}

/** The profile fields the baseline is derived from. */
export interface ViewerArea {
  polling_unit_id?: string | null;
  ward_id?: string | null;
  lga_id?: string | null;
}

/* ============================================================
 * HELPERS
 * ============================================================ */

export function scopeKey(scope: ReadScope): string {
  return `${scope.scope_type}__${scope.scope_id}`;
}

export function dedupeScopes(scopes: ReadScope[]): ReadScope[] {
  const byKey = new Map<string, ReadScope>();

  for (const scope of scopes) {
    if (scope.scope_type !== "global" && !scope.scope_id) continue;
    byKey.set(scopeKey(scope), scope);
  }

  return Array.from(byKey.values());
}

export function hasGlobalScope(scopes: ReadScope[]): boolean {
  return scopes.some((scope) => scope.scope_type === "global");
}

/**
 * Split an id list into `in` chunks that stay inside the rules access
 * budget (see `RULES_ACCESS_BUDGET_LIMIT`). The 30-value Firestore cap
 * still applies as a hard ceiling, but is never the binding one.
 */
export function chunkIds(ids: string[]): string[][] {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const chunks: string[][] = [];

  for (let index = 0; index < unique.length; index += RULES_ACCESS_BUDGET_LIMIT) {
    chunks.push(unique.slice(index, index + RULES_ACCESS_BUDGET_LIMIT));
  }

  return chunks;
}

export interface ScopeQueryGroup {
  scope_type: ScopeType;
  scope_ids: string[];
}

/**
 * Collapse pairs into one query descriptor per scope type: the queries a
 * data module issues are `scope_type == t && scope_id in ids`.
 *
 * Global scopes are returned separately because they mean "no filter"
 * (admin, or a state-scoped coordinator whose `view_*` grant is global).
 */
export function groupScopeQueries(scopes: ReadScope[]): {
  global: boolean;
  groups: ScopeQueryGroup[];
} {
  const byType = new Map<ScopeType, string[]>();

  let global = false;

  for (const scope of dedupeScopes(scopes)) {
    if (scope.scope_type === "global") {
      global = true;
      continue;
    }

    const current = byType.get(scope.scope_type) ?? [];
    current.push(scope.scope_id);
    byType.set(scope.scope_type, current);
  }

  return {
    global,
    groups: Array.from(byType.entries()).map(([scope_type, scope_ids]) => ({
      scope_type,
      scope_ids: Array.from(new Set(scope_ids)),
    })),
  };
}

/* ============================================================
 * VIEWER GRANTS — per-permission authority
 * ============================================================
 *
 * The baseline/coordinator helpers below answer "what area is the
 * viewer over". That is the WRONG question for a per-collection read:
 * a PU coordinator is over a polling unit, but their `manage_issue`
 * grant exists ONLY at that polling unit, so asking for ward-scoped
 * issues is denied by the rules even though the ward is inside their
 * area.
 *
 * A read therefore has to be driven by the access documents the rules
 * actually look up, which the campaign projection derives from the
 * signed-in profile and its active assignments (see
 * `computeExpectedCampaignAccess()`). Everything here is pure: the
 * same call in the browser and in the rules tests produces the same
 * grant list.
 */

/** One `user_access` entitlement, exactly as the rules read it. */
export interface ViewerGrant {
  permission: string;
  scope_type: ScopeType | "global";
  scope_id: string;
}

/**
 * The grants the campaign projection writes for this viewer.
 *
 * Returns [] for an ineligible account (no `campaign_member`, an
 * election officer), which callers must treat as "reads nothing",
 * never as "reads everything".
 */
export function viewerGrants(params: {
  userId: string;
  profile: CampaignAccessProfile | null | undefined;
  assignments: CampaignAccessAssignment[];
  lgas: LGA[];
}): ViewerGrant[] {
  return computeExpectedCampaignAccess(params).map((doc) => ({
    permission: doc.permission,
    scope_type: doc.scope_type,
    scope_id: doc.scope_id,
  }));
}

/**
 * Read a grant list straight from `user_access` documents.
 *
 * Used where the documents are already in hand (tests, an admin
 * recompute): the resolver is source-agnostic, so the DB-backed and the
 * derived lists are interchangeable.
 */
export function grantsFromAccessDocs(
  docs: Array<Record<string, unknown>>,
): ViewerGrant[] {
  const grants: ViewerGrant[] = [];

  for (const doc of docs) {
    if (doc.allowed === false) continue;

    const permission = String(doc.permission ?? "");
    const scopeType = String(doc.scope_type ?? "");
    const scopeId = String(doc.scope_id ?? "");

    if (!permission || !scopeType) continue;
    if (scopeType !== "global" && !scopeId) continue;

    grants.push({
      permission,
      scope_type: scopeType as ViewerGrant["scope_type"],
      scope_id: scopeId,
    });
  }

  return grants;
}

/**
 * The scopes at which the viewer holds ANY of `permissions`.
 *
 * This is the ONLY source a filtered read may use: every returned pair
 * is a pair the rules can prove for that document shape.
 */
export function grantScopes(
  grants: ViewerGrant[],
  permissions: string[],
): ReadScope[] {
  const wanted = new Set(permissions);

  return dedupeScopes(
    grants
      .filter((grant) => wanted.has(grant.permission))
      .map((grant) => ({
        scope_type: grant.scope_type,
        scope_id: grant.scope_id,
      })),
  );
}

/** True when the viewer holds `permission` at `scope` (or globally). */
export function hasGrant(
  grants: ViewerGrant[],
  permission: string,
  scope: ReadScope,
): boolean {
  return grants.some(
    (grant) =>
      grant.permission === permission &&
      (grant.scope_type === "global" ||
        (grant.scope_type === scope.scope_type &&
          grant.scope_id === scope.scope_id)),
  );
}

/**
 * The grants an ADMIN effectively holds inside a scope.
 *
 * `isAdmin()` short-circuits every campaign read clause, so for an admin
 * every scope pair in the requested scope is provable — no `user_access`
 * document is consulted. The read plan is therefore the scope's own
 * geography, which is what keeps an admin's scope filter meaningful.
 */
export function adminScopeGrants(
  scope: CampaignScope | null,
  permissions: string[],
): ViewerGrant[] {
  const targets: ReadScope[] =
    !scope || scope.level === "state" || scope.level === "campaign"
      ? [{ scope_type: "global", scope_id: "" }]
      : [{ scope_type: scope.level, scope_id: scope.scope_id }];

  if (scope && scope.level !== "state" && scope.level !== "campaign") {
    for (const lgaId of scope.lgaIds ?? []) {
      targets.push({ scope_type: "lga", scope_id: lgaId });
    }

    for (const wardId of scope.wardIds ?? []) {
      targets.push({ scope_type: "ward", scope_id: wardId });
    }
  }

  const scopes = dedupeScopes(targets);
  const grants: ViewerGrant[] = [];

  for (const permission of permissions) {
    for (const scope of scopes) {
      grants.push({
        permission,
        scope_type: scope.scope_type,
        scope_id: scope.scope_id,
      });
    }
  }

  return grants;
}

/** Ward ids where the viewer holds ANY of `permissions`. */
export function grantWardIds(
  grants: ViewerGrant[],
  permissions: string[],
): string[] {
  const wanted = new Set(permissions);

  return Array.from(
    new Set(
      grants
        .filter(
          (grant) =>
            wanted.has(grant.permission) && grant.scope_type === "ward",
        )
        .map((grant) => grant.scope_id)
        .filter(Boolean),
    ),
  );
}

/** Ids at one level where the viewer holds ANY of `permissions`. */
export function grantScopeIds(
  grants: ViewerGrant[],
  permissions: string[],
  scopeType: ScopeType,
): string[] {
  const wanted = new Set(permissions);

  return Array.from(
    new Set(
      grants
        .filter(
          (grant) =>
            wanted.has(grant.permission) && grant.scope_type === scopeType,
        )
        .map((grant) => grant.scope_id)
        .filter(Boolean),
    ),
  );
}

/* ============================================================
 * BASELINE SCOPES
 * ============================================================ */

/**
 * `view_activities` at the member's own area: PU, ward, LGA, zone and
 * the state. These five are exactly the cascade-up baseline written by
 * `buildBaselineAccessDocs()`.
 */
export function baselineActivityScopes(area: ViewerArea): ReadScope[] {
  const puId = area.polling_unit_id ?? "";
  const wardId = area.ward_id ?? "";
  const lgaId = area.lga_id ?? "";
  const zoneId = zoneIdForLga(lgaId);

  const scopes: ReadScope[] = [];

  if (puId) scopes.push({ scope_type: "polling_unit", scope_id: puId });
  if (wardId) scopes.push({ scope_type: "ward", scope_id: wardId });
  if (lgaId) scopes.push({ scope_type: "lga", scope_id: lgaId });
  if (zoneId) scopes.push({ scope_type: "senatorial_zone", scope_id: zoneId });

  scopes.push({ scope_type: "state", scope_id: STATE_SCOPE_ID });

  return dedupeScopes(scopes);
}

/**
 * The permissions that only exist at the member's own polling unit
 * (`view_members`, `view_assignments`, `submit_field_report`,
 * `report_issue`). A plain member holds nothing above it.
 */
export function baselinePollingUnitScopes(area: ViewerArea): ReadScope[] {
  const puId = area.polling_unit_id ?? "";
  return puId ? [{ scope_type: "polling_unit", scope_id: puId }] : [];
}

/* ============================================================
 * COORDINATOR SCOPES
 * ============================================================ */

/**
 * The scopes a coordinator assignment grants, expanded the same way
 * `resolveScopeTargets()` expands it in the projection: the assignment's
 * own scope, every LGA it covers and every ward it covers.
 *
 * A state-scoped assignment projects a GLOBAL grant, so it is returned
 * as `global` and the caller may skip filtering entirely.
 */
export function coordinatorReadScopes(
  scope: CampaignScope | null | undefined,
): ReadScope[] {
  if (!scope?.level || !scope.scope_id) return [];

  if (scope.level === "state" || scope.level === "campaign") {
    return [{ scope_type: "global", scope_id: "" }];
  }

  const scopes: ReadScope[] = [
    { scope_type: scope.level, scope_id: scope.scope_id },
  ];

  for (const lgaId of scope.lgaIds ?? []) {
    scopes.push({ scope_type: "lga", scope_id: lgaId });
  }

  for (const wardId of scope.wardIds ?? []) {
    scopes.push({ scope_type: "ward", scope_id: wardId });
  }

  return dedupeScopes(scopes);
}

/** Baseline + coordinator authority for `campaign_activities`. */
export function activityReadScopes(
  area: ViewerArea,
  scope: CampaignScope | null | undefined,
): ReadScope[] {
  return dedupeScopes([
    ...baselineActivityScopes(area),
    ...coordinatorReadScopes(scope),
  ]);
}

/** Baseline + coordinator authority for `view_members` / `view_assignments`. */
export function pollingUnitReadScopes(
  area: ViewerArea,
  scope: CampaignScope | null | undefined,
): ReadScope[] {
  return dedupeScopes([
    ...baselinePollingUnitScopes(area),
    ...coordinatorReadScopes(scope),
  ]);
}

/**
 * Wards whose PU-scoped documents a coordinator may read.
 *
 * A plain member's authority is a single polling unit, so the answer is
 * empty — their own PU is already covered by the exact PU query and
 * they hold no ward grant. Only an actual coordinator widens to a ward.
 */
export function activityWardIds(
  scope: CampaignScope | null | undefined,
): string[] {
  if (!scope?.level || !scope.scope_id) return [];
  if (scope.level === "state" || scope.level === "campaign") return [];
  if (scope.level === "polling_unit") return [];

  return Array.from(new Set((scope.wardIds ?? []).filter(Boolean)));
}

/**
 * The area to derive the baseline from. Callers pass the signed-in
 * profile; when they cannot (a resolved scope only), the scope's own
 * geography is used so the query is still filtered to what the caller
 * holds.
 */
export function areaFromScope(
  scope: CampaignScope,
  area?: ViewerArea | null,
): ViewerArea {
  if (area?.polling_unit_id || area?.ward_id || area?.lga_id) return area;

  return {
    polling_unit_id:
      scope.level === "polling_unit" ? scope.scope_id : undefined,
    ward_id: scope.wardIds[0],
    lga_id: scope.lgaIds[0],
  };
}
