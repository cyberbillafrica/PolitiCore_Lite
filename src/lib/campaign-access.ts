/*
 * ============================================================
 * CAMPAIGN ACCESS PROJECTION — PURE, FIREBASE-FREE
 * ============================================================
 *
 * `user_access` is the index the Firestore rules read:
 *
 *   {uid}__{permission}__global
 *   {uid}__{permission}__{scope_type}__{scope_id}
 *
 * Two projections write into it:
 *
 *   campaign ........ this module (baseline + coordinator grants)
 *   election ....... view_election_results, written by
 *                    `syncElectionResultAccessForAssignment()`
 *
 * This module owns the CAMPAIGN half and is deliberately free of any
 * Firebase import, so the browser app, the offline regression script
 * and the Admin-SDK migration scripts all compute the projection from
 * exactly the same code. `src/lib/firebase/userAccess.ts` is the only
 * writer; the scripts only compute and apply the same plan.
 *
 * The projection has two layers, and the second is ADDITIVE to the
 * first:
 *
 *   1. BASELINE — every eligible campaign member gets 9 documents for
 *      their own registered area. Without it a plain member has zero
 *      grants, so every rules check gated on `hasAccess()` fails and
 *      the campaign pages render "Missing or insufficient permissions".
 *      It also gives coordinators the cascade-up `view_activities`
 *      grants (LGA / zone / state) their dashboard reads need.
 *
 *   2. COORDINATOR GRANTS — an active organizational assignment widens
 *      authority over its scope (and, through `isScopeDescendant`, over
 *      everything below it). Scope expansion is done here rather than
 *      in the rules because a security rule cannot walk the hierarchy.
 *
 * Positions come from `src/lib/permissions.ts`; this module is the
 * rules-facing subset of that matrix (documented per entry below). It
 * never invents a permission or a scope id.
 */

import { ENUGU_CONSTITUENCIES, lookupConstituencyLgaIds } from "@/data/constituencies";

import type { LGA, OrganizationalPosition, ScopeType } from "@/types";

/* ============================================================
 * CONSTANTS
 * ============================================================ */

/** Single canonical state scope id — matches the election engine. */
export const STATE_SCOPE_ID = "enugu-state";

/** The permission the election projection owns; never touched here. */
export const ELECTION_RESULTS_PERMISSION = "view_election_results";

/**
 * Round 10 write grant, also owned by the election projection.
 *
 * A coordinator may submit a result for any polling unit inside their
 * assignment. The grant is written by
 * `syncElectionResultAccessForAssignment()` at the assignment's scope
 * (ward / LGA + wards / zone + LGAs + wards / global), NOT by the
 * campaign projection: keeping it out of `computeExpectedCampaignAccess`
 * preserves the campaign read-grant count (the LGA coordinator's 187)
 * while the create rule still finds the grant.
 */
export const ELECTION_UPLOAD_PERMISSION = "upload_election_result";

/**
 * Permission → position matrix for the CAMPAIGN projection.
 *
 * This mirrors the campaign-relevant subset of
 * `positionHasPermission()` in `src/lib/permissions.ts`. Every entry is
 * a real `Permission` in the current matrix; nothing legacy
 * (`manage_documents`, `send_notice`, `view_analytics`, …) is projected
 * because the rules never consult it for campaign reads.
 *
 * `campaign_member` deliberately projects nothing: a plain member's
 * authority is their registered area, which the baseline below covers
 * for their own PU / ward / LGA / zone / state. A `campaign_member`
 * assignment is a location marker, not authority.
 */
export const CAMPAIGN_PROJECTION_PERMISSIONS: Partial<
  Record<OrganizationalPosition, string[]>
> = {
  pu_coordinator: [
    "view_members",
    "view_assignments",
    "create_assignment",
    "assign_task",
    "review_assignment",
    "view_activities",
    "create_activity",
    "manage_activity",
    "submit_field_report",
    "review_field_report",
    "report_issue",
    "manage_issue",
  ],
  ward_coordinator: [
    "view_members",
    "view_assignments",
    "create_assignment",
    "assign_task",
    "review_assignment",
    "view_activities",
    "create_activity",
    "manage_activity",
    "submit_field_report",
    "review_field_report",
    "report_issue",
    "manage_issue",
  ],
  lga_coordinator: [
    "view_members",
    "view_assignments",
    "create_assignment",
    "assign_task",
    "review_assignment",
    "view_activities",
    "create_activity",
    "manage_activity",
    "submit_field_report",
    "review_field_report",
    "report_issue",
    "manage_issue",
  ],
  zone_coordinator: [
    "view_members",
    "view_assignments",
    "create_assignment",
    "assign_task",
    "review_assignment",
    "view_activities",
    "create_activity",
    "manage_activity",
    "submit_field_report",
    "review_field_report",
    "report_issue",
    "manage_issue",
  ],
  state_coordinator: [
    "view_members",
    "view_assignments",
    "create_assignment",
    "assign_task",
    "review_assignment",
    "view_activities",
    "create_activity",
    "manage_activity",
    "submit_field_report",
    "review_field_report",
    "report_issue",
    "manage_issue",
    "manage_members",
  ],
  campaign_manager: [
    "view_members",
    "view_assignments",
    "create_assignment",
    "assign_task",
    "review_assignment",
    "view_activities",
    "create_activity",
    "manage_activity",
    "submit_field_report",
    "review_field_report",
    "report_issue",
    "manage_issue",
    "manage_members",
  ],
  council_chairman: [
    "view_members",
    "view_assignments",
    "create_assignment",
    "assign_task",
    "review_assignment",
    "view_activities",
    "create_activity",
    "manage_activity",
    "submit_field_report",
    "review_field_report",
    "report_issue",
    "manage_issue",
    "manage_members",
  ],
};

/* ============================================================
 * BASELINE
 * ============================================================ */

/**
 * The five permissions the baseline grants at the member's own polling
 * unit (the other four baseline documents are `view_activities` at the
 * ward, LGA, zone and state above it).
 */
export const BASELINE_POLLING_UNIT_PERMISSIONS = [
  "view_activities",
  "view_members",
  "view_assignments",
  "submit_field_report",
  "report_issue",
] as const;

/** Every permission the campaign projection can ever write. */
export const CAMPAIGN_PROJECTED_PERMISSIONS: string[] = Array.from(
  new Set([
    ...BASELINE_POLLING_UNIT_PERMISSIONS,
    ...Object.values(CAMPAIGN_PROJECTION_PERMISSIONS).flat(),
  ]),
).sort();

/** How many documents the baseline is expected to have. */
export const BASELINE_DOC_COUNT = 9;

/* ============================================================
 * TYPES
 * ============================================================ */

/** The profile fields the projection depends on. */
export interface CampaignAccessProfile {
  access_role?: string | null;
  membership_types?: string[] | null;
  lga_id?: string | null;
  ward_id?: string | null;
  polling_unit_id?: string | null;
}

/** The assignment fields the projection depends on. */
export interface CampaignAccessAssignment {
  position: OrganizationalPosition;
  scope_type: ScopeType;
  scope_id: string;
  status?: string | null;
}

/** One projected `user_access` document. */
export interface CampaignAccessDoc {
  id: string;
  permission: string;
  scope_type: ScopeType | "global";
  scope_id: string;
}

export interface CampaignAccessDiff {
  toAdd: CampaignAccessDoc[];
  toDelete: string[];
  expected: CampaignAccessDoc[];
}

/* ============================================================
 * ELIGIBILITY
 * ============================================================ */

/**
 * Campaign participation: an active `campaign_member` membership and
 * anything other than the election-officer access role.
 *
 * An election officer is excluded even when they also carry
 * `campaign_member` — election operations are a separate portal.
 * Admins are NOT special-cased here: the rules short-circuit on
 * `isAdmin()` anyway, and an admin who is also a campaign member gets
 * the same baseline as everybody else.
 */
export function isCampaignProjectionEligible(
  profile: CampaignAccessProfile | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.access_role === "election_officer") return false;

  return (profile.membership_types ?? []).includes("campaign_member");
}

/**
 * Baseline eligibility: campaign participation AND a complete home
 * area. Without a PU / ward / LGA there is no scope to project to.
 */
export function isBaselineEligible(
  profile: CampaignAccessProfile | null | undefined,
): boolean {
  if (!isCampaignProjectionEligible(profile)) return false;

  return Boolean(
    profile?.polling_unit_id && profile?.ward_id && profile?.lga_id,
  );
}

/* ============================================================
 * DOCUMENT IDS
 * ============================================================ */

export function buildCampaignAccessDocId(
  userId: string,
  permission: string,
  scopeType: ScopeType | "global",
  scopeId: string,
): string {
  return scopeType === "global"
    ? `${userId}__${permission}__global`
    : `${userId}__${permission}__${scopeType}__${scopeId}`;
}

/**
 * The permission segment of a projected document id, or "" when the id
 * is not in the projected shape.
 */
export function permissionFromAccessDocId(docId: string): string {
  const parts = (docId ?? "").split("__");
  return parts.length >= 3 ? parts[1] : "";
}

/* ============================================================
 * ZONE DERIVATION
 * ============================================================ */

/**
 * The senatorial zone an LGA belongs to, from the same static
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

/* ============================================================
 * BASELINE DOCUMENTS
 * ============================================================ */

/**
 * The 9 baseline documents for an eligible member.
 *
 *   view_activities .... own PU, ward, LGA, zone, state (cascade-up)
 *   view_members ....... own PU
 *   view_assignments ... own PU
 *   submit_field_report  own PU
 *   report_issue ....... own PU
 *
 * A member whose LGA is not in any known zone gets 8: the zone grant
 * cannot be derived, and guessing one would break the hierarchy.
 */
export function buildBaselineAccessDocs(
  userId: string,
  profile: CampaignAccessProfile | null | undefined,
): CampaignAccessDoc[] {
  if (!userId || !isBaselineEligible(profile)) return [];

  const puId = String(profile?.polling_unit_id ?? "");
  const wardId = String(profile?.ward_id ?? "");
  const lgaId = String(profile?.lga_id ?? "");
  const zoneId = zoneIdForLga(lgaId);

  const docs: Array<Omit<CampaignAccessDoc, "id">> = [
    {
      permission: "view_activities",
      scope_type: "polling_unit",
      scope_id: puId,
    },
    { permission: "view_activities", scope_type: "ward", scope_id: wardId },
    { permission: "view_activities", scope_type: "lga", scope_id: lgaId },
  ];

  if (zoneId) {
    docs.push({
      permission: "view_activities",
      scope_type: "senatorial_zone",
      scope_id: zoneId,
    });
  }

  docs.push({
    permission: "view_activities",
    scope_type: "state",
    scope_id: STATE_SCOPE_ID,
  });

  for (const permission of BASELINE_POLLING_UNIT_PERMISSIONS) {
    if (permission === "view_activities") continue;

    docs.push({
      permission,
      scope_type: "polling_unit",
      scope_id: puId,
    });
  }

  return docs.map((doc) => ({
    ...doc,
    id: buildCampaignAccessDocId(
      userId,
      doc.permission,
      doc.scope_type,
      doc.scope_id,
    ),
  }));
}

/* ============================================================
 * COORDINATOR SCOPE EXPANSION
 * ============================================================ */

interface AccessTarget {
  scope_type: ScopeType | "global";
  scope_id: string;
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

/**
 * Expand an assignment scope into the documents the rules look for.
 *
 * Polling units are deliberately not enumerated for an LGA or zone
 * assignment: every campaign document that can be scoped to a PU also
 * carries its ward, and the rules fall back to the ward grant. That
 * keeps a zone assignment to a few hundred rows instead of thousands.
 *
 * Returns [] when the scope cannot be resolved from the hierarchy —
 * callers must treat that as "grants nothing", never as "grants
 * everything".
 */
export function resolveScopeTargets(
  scopeType: ScopeType,
  scopeId: string,
  lgas: LGA[],
): AccessTarget[] {
  const id = (scopeId ?? "").trim();
  if (!id) return [];

  switch (scopeType) {
    case "polling_unit":
      return [{ scope_type: "polling_unit", scope_id: id }];

    case "ward":
      return [{ scope_type: "ward", scope_id: id }];

    case "lga": {
      const lga = matchLga(lgas, id);
      if (!lga) return [];

      return [
        { scope_type: "lga", scope_id: lga.id },
        ...lga.wards.map((ward) => ({
          scope_type: "ward" as const,
          scope_id: ward.id,
        })),
      ];
    }

    case "senatorial_zone": {
      const zoneLgaIds = lookupConstituencyLgaIds({
        scope_type: "senatorial_zone",
        scope_id: id,
      });

      if (zoneLgaIds.length === 0) return [];

      const zoneIds = zoneLgaIds.map((item) => item.toLowerCase());

      const covered = lgas.filter((lga) =>
        zoneIds.includes(lga.id.toLowerCase()),
      );

      return [
        /*
         * The zone itself. Without this the coordinator holds grants in
         * every LGA and ward inside the zone but NOT at the zone level,
         * so a zone-scoped activity, issue or assignment is denied to the
         * zone coordinator — and every query filtering on the zone scope
         * fails with "Missing or insufficient permissions".
         */
        { scope_type: "senatorial_zone" as const, scope_id: id },
        ...covered.map((lga) => ({
          scope_type: "lga" as const,
          scope_id: lga.id,
        })),
        ...covered.flatMap((lga) =>
          lga.wards.map((ward) => ({
            scope_type: "ward" as const,
            scope_id: ward.id,
          })),
        ),
      ];
    }

    case "state":
    case "campaign":
      return [{ scope_type: "global", scope_id: "" }];

    default:
      return [];
  }
}

/* ============================================================
 * FULL EXPECTED PROJECTION
 * ============================================================ */

/**
 * The complete projection a user should have, derived from their
 * CURRENT state only. Nothing here reads Firestore, so the same call in
 * the app and in the migration scripts produces the same ids.
 */
export function computeExpectedCampaignAccess(params: {
  userId: string;
  profile: CampaignAccessProfile | null | undefined;
  assignments: CampaignAccessAssignment[];
  lgas: LGA[];
}): CampaignAccessDoc[] {
  const { userId, profile, assignments, lgas } = params;

  if (!userId || !isCampaignProjectionEligible(profile)) return [];

  const byId = new Map<string, CampaignAccessDoc>();

  for (const doc of buildBaselineAccessDocs(userId, profile)) {
    byId.set(doc.id, doc);
  }

  for (const assignment of assignments) {
    if (assignment.status && assignment.status !== "active") continue;

    const permissions =
      CAMPAIGN_PROJECTION_PERMISSIONS[assignment.position] ?? [];
    if (permissions.length === 0) continue;

    const targets = resolveScopeTargets(
      assignment.scope_type,
      assignment.scope_id,
      lgas,
    );

    for (const target of targets) {
      for (const permission of permissions) {
        const id = buildCampaignAccessDocId(
          userId,
          permission,
          target.scope_type,
          target.scope_id,
        );

        byId.set(id, {
          id,
          permission,
          scope_type: target.scope_type,
          scope_id: target.scope_id,
        });
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Diff the expected projection against the ids currently recorded for
 * the user.
 *
 * Any recorded id that is not expected is deleted — that is what
 * removes a grant left behind by a previous position, a previous home
 * area, a legacy permission name or a legacy `tenant_id` document.
 *
 * The election projection (`view_election_results`) is owned by another
 * writer and is never touched, whatever this returns.
 */
export function diffCampaignAccess(
  expected: CampaignAccessDoc[],
  recordedIds: string[],
): CampaignAccessDiff {
  const expectedIds = new Set(expected.map((doc) => doc.id));
  const recorded = new Set(recordedIds.filter(Boolean));

  return {
    toAdd: expected.filter((doc) => !recorded.has(doc.id)),
    toDelete: Array.from(recorded).filter(
      (id) =>
        !expectedIds.has(id) &&
        permissionFromAccessDocId(id) !== ELECTION_RESULTS_PERMISSION &&
        permissionFromAccessDocId(id) !== ELECTION_UPLOAD_PERMISSION,
    ),
    expected,
  };
}

/**
 * True when a recorded id belongs to the campaign projection namespace
 * (and therefore may be deleted by this round's cleanup).
 */
export function isCampaignProjectedAccessId(docId: string): boolean {
  const permission = permissionFromAccessDocId(docId);
  return (
    Boolean(permission) &&
    permission !== ELECTION_RESULTS_PERMISSION &&
    permission !== ELECTION_UPLOAD_PERMISSION
  );
}
