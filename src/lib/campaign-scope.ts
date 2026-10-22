/*
 * ============================================================
 * CAMPAIGN SCOPE RESOLVER — SINGLE PLACE HIERARCHY IS EXPANDED
 * ============================================================
 *
 * Campaign pages never guess a hierarchy. They ask this module:
 *
 *   "What geographic area does this assignment cover?"
 *   "Does this scope sit inside that scope?"
 *   "May I create work at this scope?"
 *
 * The geographic vocabulary is the election engine's own:
 *
 *   state            -> "enugu-state"
 *   senatorial_zone  -> "enugu-east" | "enugu-north" | "enugu-west"
 *   lga              -> "nkanu-west"
 *   ward             -> "nkanu-west-ward-03"
 *   polling_unit     -> "nkanu-west-ward-03-pu-001"
 *
 * `ScopeType` and `isScopeDescendant()` are reused verbatim — nothing
 * here invents a second hierarchy. The only thing this module adds is
 * EXPANSION: turning a coarse scope into the exact ward and polling
 * unit ids that Firestore must query, using the live
 * `electoral_data/enugu-state` document (with its bundled fallback).
 *
 * Zone -> LGA membership comes from the static constituency reference,
 * which is the same source the election engine uses when a contest
 * carries no explicit `lga_ids`.
 */

import {
  ENUGU_CONSTITUENCIES,
  lookupConstituencyLgaIds,
} from "@/data/constituencies";
import { getAllEnuguLGAs } from "@/lib/firebase/electoral";
import { assignmentCoversScope, isScopeDescendant } from "@/lib/permissions";

import type {
  LGA,
  OrganizationalAssignment,
  OrganizationalPosition,
  ScopeType,
  UserProfile,
} from "@/types";

/* ============================================================
 * CONSTANTS
 * ============================================================ */

/** How deep each level sits in the hierarchy. Higher covers lower. */
export const SCOPE_DEPTH: Record<ScopeType, number> = {
  campaign: 0,
  state: 1,
  senatorial_zone: 2,
  lga: 3,
  ward: 4,
  polling_unit: 5,
};

/**
 * The geographic level each coordinator position governs.
 *
 * `campaign_member` holds no position and therefore no widening scope —
 * their "My Area" is their own registered polling unit.
 */
export const POSITION_SCOPE_LEVEL: Record<OrganizationalPosition, ScopeType | null> = {
  state_coordinator: "state",
  zone_coordinator: "senatorial_zone",
  lga_coordinator: "lga",
  ward_coordinator: "ward",
  pu_coordinator: "polling_unit",
  campaign_member: null,
  campaign_manager: "state",
  council_chairman: "state",
};

/** Coordinators, highest first. Used for "primary position" display. */
export const COORDINATOR_PRIORITY: OrganizationalPosition[] = [
  "council_chairman",
  "campaign_manager",
  "state_coordinator",
  "zone_coordinator",
  "lga_coordinator",
  "ward_coordinator",
  "pu_coordinator",
  "campaign_member",
];

/** The three senatorial zones, in their canonical dataset id form. */
export const ZONE_IDS = ["enugu-east", "enugu-north", "enugu-west"] as const;

/* ============================================================
 * SCOPE DESCRIPTOR
 * ============================================================ */

export interface CampaignScope {
  level: ScopeType;
  scope_id: string;

  /** Human label, e.g. "Nkanu West LGA". */
  label: string;

  /** Every LGA the scope covers (empty when it cannot be resolved). */
  lgaIds: string[];

  /** Every ward the scope covers. */
  wardIds: string[];

  /** Every polling unit the scope covers. */
  pollingUnitIds: string[];
}

/* ============================================================
 * POSITION HELPERS
 * ============================================================ */

export function positionScopeLevel(
  position: OrganizationalPosition | null | undefined,
): ScopeType | null {
  if (!position) return null;
  return POSITION_SCOPE_LEVEL[position] ?? null;
}

export function isCoordinatorPosition(
  position: OrganizationalPosition | null | undefined,
): boolean {
  return positionScopeLevel(position) !== null;
}

/**
 * Positions that may create work at their own scope or below.
 * `campaign_member` is deliberately absent.
 */
export function canCreateForPosition(
  position: OrganizationalPosition | null | undefined,
): boolean {
  return positionScopeLevel(position) !== null;
}

/**
 * The user's highest-ranking active assignment.
 */
export function getPrimaryCampaignAssignment(
  assignments: OrganizationalAssignment[],
): OrganizationalAssignment | null {
  const active = assignments.filter((item) => item.status === "active");
  if (active.length === 0) return null;

  for (const position of COORDINATOR_PRIORITY) {
    const match = active.find((item) => item.position === position);
    if (match) return match;
  }

  return active[0] ?? null;
}

/* ============================================================
 * EFFECTIVE AUTHORITY
 * ============================================================ */

export interface CampaignAuthority {
  isAdmin: boolean;

  /** Highest active assignment, if any. */
  assignment: OrganizationalAssignment | null;

  position: OrganizationalPosition | null;

  /** Level of the authority. Null for a plain member with no PU. */
  level: ScopeType | null;

  /** Scope id of the authority. */
  scopeId: string | null;

  /** True when the position actually widens authority beyond self. */
  isCoordinator: boolean;
}

/**
 * Resolve what a user may see and do.
 *
 * A coordinator's authority comes from the assignment. A plain member's
 * authority is their registered polling unit (falling back to their
 * ward when no PU is recorded), which is read-only.
 */
export function resolveCampaignAuthority(
  profile: UserProfile | null,
  assignments: OrganizationalAssignment[],
): CampaignAuthority {
  const isAdmin = profile?.access_role === "admin";
  const assignment = getPrimaryCampaignAssignment(assignments);

  if (assignment) {
    const position = assignment.position;
    const level = positionScopeLevel(position);

    if (level) {
      return {
        isAdmin,
        assignment,
        position,
        level,
        scopeId: assignment.scope_id,
        isCoordinator: true,
      };
    }
  }

  // Plain member (or a campaign_member marker assignment): self scope.
  const puId = profile?.polling_unit_id || null;
  const wardId = profile?.ward_id || null;

  if (puId) {
    return {
      isAdmin,
      assignment,
      position: assignment?.position ?? null,
      level: "polling_unit",
      scopeId: puId,
      isCoordinator: false,
    };
  }

  if (wardId) {
    return {
      isAdmin,
      assignment,
      position: assignment?.position ?? null,
      level: "ward",
      scopeId: wardId,
      isCoordinator: false,
    };
  }

  return {
    isAdmin,
    assignment,
    position: assignment?.position ?? null,
    level: null,
    scopeId: null,
    isCoordinator: false,
  };
}

/* ============================================================
 * EXPANSION
 * ============================================================ */

function lgaIdsForZone(scopeId: string): string[] {
  return lookupConstituencyLgaIds({
    scope_type: "senatorial_zone",
    scope_id: scopeId,
  });
}

function matchLga(lgas: LGA[], id: string): LGA | null {
  const target = (id ?? "").trim().toLowerCase();
  if (!target) return null;

  return (
    lgas.find((lga) => {
      const lgaId = lga.id.toLowerCase();
      return (
        lgaId === target ||
        lgaId === target.replace(/-lga$/, "") ||
        `${lgaId}-lga` === target
      );
    }) ?? null
  );
}

function matchWard(lgas: LGA[], id: string): { lga: LGA; wardIndex: number } | null {
  if (!id) return null;

  for (const lga of lgas) {
    const wardIndex = lga.wards.findIndex((ward) => ward.id === id);
    if (wardIndex >= 0) return { lga, wardIndex };
  }

  return null;
}

/**
 * Expand a scope into its exact geographic membership.
 *
 * Returns `null` when the scope cannot be resolved at all (an unknown
 * LGA id, a ward that no longer exists). Callers must treat that as
 * "nothing to show", never as "show everything".
 */
export async function resolveCampaignScope(
  level: ScopeType,
  scopeId: string,
  lgas?: LGA[],
): Promise<CampaignScope | null> {
  const id = (scopeId ?? "").trim();
  if (!id) return { level, scope_id: "", label: "", lgaIds: [], wardIds: [], pollingUnitIds: [] };

  const allLgas = lgas ?? (await getAllEnuguLGAs());

  switch (level) {
    case "campaign":
    case "state": {
      return {
        level,
        scope_id: id,
        label: "Enugu State",
        lgaIds: allLgas.map((lga) => lga.id),
        wardIds: allLgas.flatMap((lga) => lga.wards.map((ward) => ward.id)),
        pollingUnitIds: allLgas.flatMap((lga) =>
          lga.wards.flatMap((ward) => ward.pollingUnits.map((pu) => pu.id)),
        ),
      };
    }

    case "senatorial_zone": {
      const zoneLgaIds = lgaIdsForZone(id);
      const covered = allLgas.filter((lga) =>
        zoneLgaIds.some((zoneId) => zoneId.toLowerCase() === lga.id.toLowerCase()),
      );

      return {
        level,
        scope_id: id,
        label: zoneLabel(id),
        lgaIds: covered.map((lga) => lga.id),
        wardIds: covered.flatMap((lga) => lga.wards.map((ward) => ward.id)),
        pollingUnitIds: covered.flatMap((lga) =>
          lga.wards.flatMap((ward) => ward.pollingUnits.map((pu) => pu.id)),
        ),
      };
    }

    case "lga": {
      const lga = matchLga(allLgas, id);
      if (!lga) return null;

      return {
        level,
        scope_id: lga.id,
        label: `${lga.name} LGA`,
        lgaIds: [lga.id],
        wardIds: lga.wards.map((ward) => ward.id),
        pollingUnitIds: lga.wards.flatMap((ward) =>
          ward.pollingUnits.map((pu) => pu.id),
        ),
      };
    }

    case "ward": {
      const found = matchWard(allLgas, id);
      if (!found) return null;

      const ward = found.lga.wards[found.wardIndex];

      return {
        level,
        scope_id: ward.id,
        label: `${ward.name} Ward (${found.lga.name})`,
        lgaIds: [found.lga.id],
        wardIds: [ward.id],
        pollingUnitIds: ward.pollingUnits.map((pu) => pu.id),
      };
    }

    case "polling_unit": {
      for (const lga of allLgas) {
        for (const ward of lga.wards) {
          const pu = ward.pollingUnits.find((unit) => unit.id === id);
          if (pu) {
            return {
              level,
              scope_id: pu.id,
              label: `${pu.name} (${ward.name} Ward, ${lga.name})`,
              lgaIds: [lga.id],
              wardIds: [ward.id],
              pollingUnitIds: [pu.id],
            };
          }
        }
      }

      return null;
    }

    default:
      return null;
  }
}

/* ============================================================
 * LABELS
 * ============================================================ */

/**
 * The senatorial zone an LGA belongs to, resolved from the same static
 * constituency reference the election engine uses. Returns "" when the
 * LGA is not part of any known zone.
 */
export function zoneIdForLga(lgaId: string): string {
  const target = (lgaId ?? "").trim().toLowerCase();
  if (!target) return "";

  const entry = ENUGU_CONSTITUENCIES.find(
    (item) =>
      item.scope_type === "senatorial_zone" &&
      item.lga_ids.some((id) => id.toLowerCase() === target),
  );

  return entry?.aliases?.[0] ?? "";
}

export function zoneLabel(scopeId: string): string {
  switch (scopeId) {
    case "enugu-east":
      return "Enugu East Senatorial Zone";
    case "enugu-north":
      return "Enugu North Senatorial Zone";
    case "enugu-west":
      return "Enugu West Senatorial Zone";
    default:
      return scopeId;
  }
}

/**
 * Label for any scope, resolving names from the electoral hierarchy.
 * Never returns an empty string.
 */
export function describeScope(
  level: ScopeType | null | undefined,
  scopeId: string | null | undefined,
  lgas: LGA[] = [],
): string {
  if (!level) return "No scope";

  const id = scopeId ?? "";

  switch (level) {
    case "campaign":
    case "state":
      return "Enugu State";

    case "senatorial_zone":
      return zoneLabel(id);

    case "lga": {
      const lga = matchLga(lgas, id);
      return lga ? `${lga.name} LGA` : id || "LGA";
    }

    case "ward": {
      const found = matchWard(lgas, id);
      if (!found) return id || "Ward";
      const ward = found.lga.wards[found.wardIndex];
      return `${ward.name} Ward`;
    }

    case "polling_unit": {
      for (const lga of lgas) {
        for (const ward of lga.wards) {
          const pu = ward.pollingUnits.find((unit) => unit.id === id);
          if (pu) return `${pu.code} — ${pu.name}`;
        }
      }
      return id || "Polling Unit";
    }

    default:
      return id;
  }
}

/* ============================================================
 * COVERAGE
 * ============================================================ */

/**
 * True when `target` sits at or inside `source`.
 */
export function scopeCovers(
  source: { level: ScopeType | null; scopeId: string | null },
  target: { level: ScopeType; scopeId: string },
  lgas?: LGA[],
): boolean {
  if (!source.level || !source.scopeId) return false;

  return isScopeDescendant(
    { scope_type: source.level, scope_id: source.scopeId },
    { scope_type: target.level, scope_id: target.scopeId },
    lgas,
  );
}

/**
 * True when the user may create work (assignment / activity) whose
 * target is `target`.
 *
 * Admin may target anything. A coordinator may target their own scope
 * or anything below it — never above, never sideways.
 */
export function canCreateAtScope(
  profile: UserProfile | null,
  assignments: OrganizationalAssignment[],
  target: { level: ScopeType; scopeId: string },
  lgas?: LGA[],
): boolean {
  if (profile?.access_role === "admin") return true;
  if (!target.level || !target.scopeId) return false;

  return assignments.some((assignment) => {
    if (assignment.status !== "active") return false;
    if (!canCreateForPosition(assignment.position)) return false;

    return assignmentCoversScope(
      assignment,
      { scope_type: target.level, scope_id: target.scopeId },
      lgas,
    );
  });
}

/* ============================================================
 * MEMBER SCOPE (what an assignment covers, for reads)
 * ============================================================ */

/**
 * The scope an assignment authorises reads over.
 *
 * A `campaign_member` marker assignment is a location marker, not
 * authority, so it resolves to the member's own polling unit via
 * `resolveCampaignAuthority()` rather than through here.
 */
export async function scopeForAssignment(
  assignment: OrganizationalAssignment,
  lgas?: LGA[],
): Promise<CampaignScope | null> {
  const level = positionScopeLevel(assignment.position);

  if (!level) return null;

  return resolveCampaignScope(level, assignment.scope_id, lgas);
}
