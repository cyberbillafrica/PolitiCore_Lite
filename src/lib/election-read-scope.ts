/*
 * ============================================================
 * ELECTION READ SCOPE (query-level, rules-provable)
 * ============================================================
 *
 * Firestore is not a filter: a query must be provably readable
 * in FULL or the whole listener is rejected with
 * permission-denied. The `pu_reports` / `election_incidents` /
 * `election_results` read rules grant a signed-in user:
 *
 *   - admin / election officer  -> everything
 *   - their own documents       -> submitted_by / reported_by == uid
 *   - `user_access` projections -> ward or polling-unit scoped reads
 *
 * The `user_access` projection (src/lib/firebase/userAccess.ts)
 * is generated from ORGANIZATIONAL ASSIGNMENTS, and only for the
 * scope-granting positions — a plain `campaign_member` assignment
 * is a location marker and deliberately grants no extra reads.
 * This module derives exactly the same set the projection grants,
 * as one equality constraint per provable query:
 *
 *   ward assignment         -> { ward_id }
 *   polling-unit assignment -> { polling_unit_id }
 *   LGA assignment          -> one { ward_id } per ward in the LGA
 *   state / campaign        -> unrestricted
 *   senatorial zone         -> nothing (cannot be expanded into
 *                              wards from the electoral dataset)
 *
 * Callers then add their own extra constraints (the caller's own
 * submissions, or the registeredAt ward+polling-unit pair for
 * election results) and subscribe once per constraint, merging by
 * document id.
 */

import { deriveLgaIdFromWard } from "@/lib/election-scope";

import type {
  LGA,
  OrganizationalAssignment,
  OrganizationalPosition,
  UserProfile,
} from "@/types";

/*
 * Positions that carry election-result visibility beyond the
 * member's own documents. Mirrors SCOPE_GRANTING_POSITIONS in
 * src/lib/firebase/userAccess.ts — the two must agree or the
 * client would subscribe to documents the rules deny.
 */
const SCOPE_GRANTING_POSITIONS: OrganizationalPosition[] = [
  "ward_coordinator",
  "lga_coordinator",
  "zone_coordinator",
  "state_coordinator",
  "campaign_manager",
  "council_chairman",
];

export interface GeoReadConstraint {
  ward_id?: string;
  polling_unit_id?: string;
}

export interface ElectionReadScope {
  /**
   * The account may read the whole collection (admin, election
   * officer, or a state/campaign-wide assignment backed by a
   * global `user_access` projection).
   */
  unrestricted: boolean;

  /**
   * One provable equality constraint per readable region. Empty
   * when `unrestricted` or when the account can read nothing
   * beyond its own documents.
   */
  geoConstraints: GeoReadConstraint[];
}

function dedupe(constraints: GeoReadConstraint[]): GeoReadConstraint[] {
  const seen = new Set<string>();
  return constraints.filter((constraint) => {
    const key = JSON.stringify(constraint);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Derive the geo read scope for a signed-in account.
 *
 * `profile` and `assignments` come straight from `useAuth()`;
 * `lgas` is the state-wide electoral hierarchy (used to expand an
 * LGA assignment into the wards it covers). Ward ids are unique
 * across the state (prefixed with their LGA), so an LGA expansion
 * needs no LGA equality alongside it.
 */
export function buildElectionReadScope(
  profile: Pick<
    UserProfile,
    "access_role" | "ward_id" | "polling_unit_id"
  > | null,
  assignments: OrganizationalAssignment[],
  lgas: LGA[],
): ElectionReadScope {
  if (!profile) {
    return { unrestricted: false, geoConstraints: [] };
  }

  /*
   * Admins and election officers are unconditional in the rules
   * (`isAdmin()` / `isElectionOfficer()` do not depend on the
   * document being read), so any query is provable for them.
   */
  if (profile.access_role === "admin" || profile.access_role === "election_officer") {
    return { unrestricted: true, geoConstraints: [] };
  }

  const constraints: GeoReadConstraint[] = [];
  let unrestricted = false;

  for (const assignment of assignments) {
    if (assignment.status !== "active") continue;

    if (!SCOPE_GRANTING_POSITIONS.includes(assignment.position)) {
      // A plain campaign_member assignment grants no extra reads.
      continue;
    }

    const scopeId = (assignment.scope_id ?? "").trim();
    if (!scopeId) continue;

    switch (assignment.scope_type) {
      case "state":
      case "campaign":
        // Global projection: everything readable.
        unrestricted = true;
        break;

      case "ward":
        constraints.push({ ward_id: scopeId });
        break;

      case "polling_unit":
        constraints.push({ polling_unit_id: scopeId });
        break;

      case "lga": {
        /*
         * The projection expands an LGA into one ward-level
         * `user_access` doc per ward, so the provable query set
         * is one ward query per ward.
         */
        const normalized = scopeId.toLowerCase();
        const lga = lgas.find(
          (item) =>
            item.id.toLowerCase() === normalized ||
            item.id.toLowerCase() === normalized.replace(/-lga$/, ""),
        );

        for (const ward of lga?.wards ?? []) {
          constraints.push({ ward_id: ward.id });
        }
        break;
      }

      default:
        /*
         * senatorial_zone (and anything unrecognised) cannot be
         * expanded from the electoral dataset and grants nothing
         * — matching userAccess.resolveAccessTargets exactly.
         */
        break;
    }
  }

  return {
    unrestricted,
    geoConstraints: unrestricted ? [] : dedupe(constraints),
  };
}

/**
 * The registeredAt() pair the `election_results` rule grants on
 * top of the read scope: a member always reads the results of the
 * polling unit where they are registered. Returns null when the
 * account has no complete registered location.
 */
export function registeredPollingUnitConstraint(
  profile: Pick<UserProfile, "ward_id" | "polling_unit_id"> | null,
): GeoReadConstraint | null {
  const wardId = (profile?.ward_id ?? "").trim();
  const pollingUnitId = (profile?.polling_unit_id ?? "").trim();

  if (!wardId || !pollingUnitId) return null;

  return { ward_id: wardId, polling_unit_id: pollingUnitId };
}

/**
 * The LGA id that owns a ward — used to place result documents in
 * the contest scope without trusting a possibly-missing `lga_id`.
 */
export function lgaIdForResult(
  lgas: LGA[],
  lgaId: string | null | undefined,
  wardId: string | null | undefined,
): string {
  const direct = (lgaId ?? "").trim();
  if (direct) return direct;
  return deriveLgaIdFromWard(lgas, wardId);
}
