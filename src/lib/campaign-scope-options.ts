/*
 * ============================================================
 * CAMPAIGN SCOPE OPTIONS — DERIVED FROM THE CALLER'S GRANTS
 * ============================================================
 *
 * A picker must never offer a scope the caller cannot write to. The
 * rules answer "may this caller act at this scope?" from `user_access`,
 * so the pickers answer it from the SAME list: the caller's grants,
 * filtered to one permission.
 *
 * A grant covers its own scope and everything below it (a ward
 * coordinator may work at the ward and at each polling unit inside it),
 * which is exactly how the campaign projection writes an LGA or zone
 * assignment's grants at every ward inside it. Expanding here therefore
 * agrees with the rules instead of relying on them to reject.
 *
 * Pure and Firebase-free: the pages, the tests and any future script
 * compute the same option set.
 */

import { lookupConstituencyLgaIds } from "@/data/constituencies";

import { ZONE_IDS, type CampaignScope } from "@/lib/campaign-scope";
import { STATE_SCOPE_ID } from "@/lib/campaign-access";

import type { ViewerGrant } from "@/lib/campaign-read-scope";
import type { LGA, OrganizationalPosition, ScopeType } from "@/types";

/** One selectable target: a level and the exact id stored on a document. */
export interface ScopedOption {
  level: ScopeType;
  scope_id: string;
}

/** Hierarchy order, highest first — the order the pickers list. */
export const SCOPE_LEVEL_ORDER: ScopeType[] = [
  "state",
  "senatorial_zone",
  "lga",
  "ward",
  "polling_unit",
];

function scopeKey(option: ScopedOption): string {
  return `${option.level}__${option.scope_id}`;
}

function matchLga(lgas: LGA[], id: string): LGA | null {
  const target = (id ?? "").trim().toLowerCase();
  if (!target) return null;

  return (
    lgas.find(
      (lga) =>
        lga.id.toLowerCase() === target ||
        `${lga.id.toLowerCase()}-lga` === target,
    ) ?? null
  );
}

function lgaOfWard(lgas: LGA[], wardId: string): LGA | null {
  return lgas.find((lga) => lga.wards.some((ward) => ward.id === wardId)) ?? null;
}

/**
 * Every scope in the state: the state itself, all three zones, every
 * LGA, ward and polling unit. Used for an admin, who may target
 * anything.
 */
export function stateWideScopes(lgas: LGA[]): ScopedOption[] {
  const options: ScopedOption[] = [
    { level: "state", scope_id: STATE_SCOPE_ID },
    ...ZONE_IDS.map((zoneId) => ({
      level: "senatorial_zone" as const,
      scope_id: zoneId,
    })),
  ];

  for (const zoneId of ZONE_IDS) {
    for (const lgaId of lookupConstituencyLgaIds({
      scope_type: "senatorial_zone",
      scope_id: zoneId,
    })) {
      const lga = matchLga(lgas, lgaId);
      if (lga) options.push({ level: "lga", scope_id: lga.id });
    }
  }

  for (const lga of lgas) {
    if (!options.some((item) => item.level === "lga" && item.scope_id === lga.id)) {
      options.push({ level: "lga", scope_id: lga.id });
    }

    for (const ward of lga.wards) {
      options.push({ level: "ward", scope_id: ward.id });

      for (const pollingUnit of ward.pollingUnits) {
        options.push({ level: "polling_unit", scope_id: pollingUnit.id });
      }
    }
  }

  return dedupe(options);
}

function dedupe(options: ScopedOption[]): ScopedOption[] {
  const byKey = new Map<string, ScopedOption>();

  for (const option of options) {
    if (!option.scope_id) continue;
    byKey.set(scopeKey(option), option);
  }

  return Array.from(byKey.values());
}

/** A single grant expanded to its own scope and everything below it. */
function expandGrant(grant: ViewerGrant, lgas: LGA[]): ScopedOption[] {
  if (grant.scope_type === "global" || grant.scope_type === "state") {
    return stateWideScopes(lgas);
  }

  if (grant.scope_type === "senatorial_zone") {
    const options: ScopedOption[] = [
      { level: "senatorial_zone", scope_id: grant.scope_id },
    ];

    for (const lgaId of lookupConstituencyLgaIds({
      scope_type: "senatorial_zone",
      scope_id: grant.scope_id,
    })) {
      const lga = matchLga(lgas, lgaId);
      if (!lga) continue;

      options.push({ level: "lga", scope_id: lga.id });

      for (const ward of lga.wards) {
        options.push({ level: "ward", scope_id: ward.id });

        for (const pollingUnit of ward.pollingUnits) {
          options.push({ level: "polling_unit", scope_id: pollingUnit.id });
        }
      }
    }

    return options;
  }

  if (grant.scope_type === "lga") {
    const lga = matchLga(lgas, grant.scope_id);
    if (!lga) return [{ level: "lga", scope_id: grant.scope_id }];

    const options: ScopedOption[] = [{ level: "lga", scope_id: lga.id }];

    for (const ward of lga.wards) {
      options.push({ level: "ward", scope_id: ward.id });

      for (const pollingUnit of ward.pollingUnits) {
        options.push({ level: "polling_unit", scope_id: pollingUnit.id });
      }
    }

    return options;
  }

  if (grant.scope_type === "ward") {
    const lga = lgaOfWard(lgas, grant.scope_id);
    const ward = lga?.wards.find((item) => item.id === grant.scope_id);

    const options: ScopedOption[] = [
      { level: "ward", scope_id: grant.scope_id },
    ];

    for (const pollingUnit of ward?.pollingUnits ?? []) {
      options.push({ level: "polling_unit", scope_id: pollingUnit.id });
    }

    return options;
  }

  return [{ level: "polling_unit", scope_id: grant.scope_id }];
}

/**
 * Every scope where the viewer holds `permission`, plus everything
 * below each of them, highest level first.
 *
 * Returns [] for a viewer with no such grant — callers must treat that
 * as "nothing is writable", never as "everything is".
 */
export function writableScopes(
  grants: ViewerGrant[],
  permission: string,
  lgas: LGA[],
): ScopedOption[] {
  const options = dedupe(
    grants
      .filter((grant) => grant.permission === permission)
      .flatMap((grant) => expandGrant(grant, lgas)),
  );

  return options.sort(
    (a, b) =>
      SCOPE_LEVEL_ORDER.indexOf(a.level) -
        SCOPE_LEVEL_ORDER.indexOf(b.level) ||
      a.scope_id.localeCompare(b.scope_id),
  );
}

/** The levels present in an option list, highest first. */
export function scopeLevels(options: ScopedOption[]): ScopeType[] {
  const present = new Set(options.map((option) => option.level));

  return SCOPE_LEVEL_ORDER.filter((level) => present.has(level));
}

/** The exact ids per level, for a picker that must not offer more. */
export function scopeIdsByLevel(
  options: ScopedOption[],
): Partial<Record<ScopeType, string[]>> {
  const byLevel: Partial<Record<ScopeType, string[]>> = {};

  for (const option of options) {
    const current = byLevel[option.level] ?? [];
    current.push(option.scope_id);
    byLevel[option.level] = Array.from(new Set(current));
  }

  return byLevel;
}

/**
 * True when `scopeId` at `level` sits at or inside `scope`.
 *
 * Used to narrow an already-loaded list to a filter selection without
 * issuing a new query: a document's own scope is the thing being
 * compared, and the resolved scope carries the exact lga / ward / PU
 * membership of its area.
 */
export function scopeContainsTarget(
  scope: CampaignScope | null,
  level: ScopeType | null | undefined,
  scopeId: string | null | undefined,
): boolean {
  if (!scope) return true;
  if (!level || !scopeId) return false;

  if (scope.level === "state" || scope.level === "campaign") return true;
  if (scope.level === level && scope.scope_id === scopeId) return true;

  if (level === "polling_unit") return scope.pollingUnitIds.includes(scopeId);
  if (level === "ward") return scope.wardIds.includes(scopeId);
  if (level === "lga") return scope.lgaIds.includes(scopeId);

  return false;
}

/* ============================================================
 * ROLE FILTER OPTIONS
 * ============================================================ */

/**
 * The coordinator position that runs each level of the hierarchy.
 *
 * A creator may only filter for positions STRICTLY BELOW the level they
 * hold, so this table is what turns "what may I target" into "whose
 * inbox may I reach".
 */
export const LEVEL_POSITION: Partial<Record<ScopeType, OrganizationalPosition>> = {
  state: "state_coordinator",
  senatorial_zone: "zone_coordinator",
  lga: "lga_coordinator",
  ward: "ward_coordinator",
  polling_unit: "pu_coordinator",
};

/** Every coordinator position, lowest rank first. */
const COORDINATOR_ROLES: OrganizationalPosition[] = SCOPE_LEVEL_ORDER
  .slice()
  .reverse()
  .map((level) => LEVEL_POSITION[level])
  .filter((position): position is OrganizationalPosition => Boolean(position));

/**
 * The highest level the viewer holds `permission` at, from their grants.
 *
 * Derived, never hardcoded: a PU coordinator's grants resolve to
 * `polling_unit`, an LGA coordinator's to `lga`, an admin (whose
 * authority is not grant-based) is handled by the caller. Returns null
 * when the viewer holds no grant for the permission.
 */
export function highestGrantedLevel(
  grants: ViewerGrant[],
  permission: string,
): ScopeType | null {
  const levels = grants
    .filter((grant) => grant.permission === permission)
    .map(
      (grant): ScopeType | "global" =>
        grant.scope_type === "global" ? "state" : grant.scope_type,
    )
    .filter((level): level is ScopeType =>
      SCOPE_LEVEL_ORDER.includes(level as ScopeType),
    );

  if (levels.length === 0) return null;

  return levels.sort(
    (a, b) => SCOPE_LEVEL_ORDER.indexOf(a) - SCOPE_LEVEL_ORDER.indexOf(b),
  )[0];
}

/**
 * Roles a creator may use as a scope-assignment filter.
 *
 * Always includes `campaign_member` (every targeted member already is
 * one). A coordinator additionally sees the positions of every level
 * strictly below their own — never their own rank and never a rank
 * above it, which is what lets a PU coordinator's filter resolve to
 * real people instead of an empty set.
 *
 * `level` comes from `highestGrantedLevel()`; an admin passes
 * `isAdmin` and sees the whole list.
 */
export function assignableRoles(
  level: ScopeType | null,
  isAdmin = false,
): OrganizationalPosition[] {
  if (isAdmin) return ["campaign_member", ...COORDINATOR_ROLES];

  const index = level ? SCOPE_LEVEL_ORDER.indexOf(level) : -1;
  if (index < 0) return ["campaign_member"];

  const below = SCOPE_LEVEL_ORDER.slice(index + 1)
    .map((lower) => LEVEL_POSITION[lower])
    .filter((position): position is OrganizationalPosition => Boolean(position))
    .reverse();

  return ["campaign_member", ...below];
}

/**
 * The whole state as a resolved `CampaignScope`.
 *
 * An admin's "All" filter has no scope to resolve, and
 * `getIssuesInScope()` deliberately returns nothing for a null scope.
 * This is the state-level scope that makes "All" mean everything.
 */
export function stateWideScope(lgas: LGA[]): CampaignScope {
  return {
    level: "state",
    scope_id: STATE_SCOPE_ID,
    label: "Enugu State",
    lgaIds: lgas.map((lga) => lga.id),
    wardIds: lgas.flatMap((lga) => lga.wards.map((ward) => ward.id)),
    pollingUnitIds: lgas.flatMap((lga) =>
      lga.wards.flatMap((ward) => ward.pollingUnits.map((unit) => unit.id)),
    ),
  };
}
