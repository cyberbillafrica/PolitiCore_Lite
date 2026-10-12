import { deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";

import { db } from "./config";
import { getAllEnuguLGAs } from "./electoral";

import type { OrganizationalPosition, ScopeType } from "@/types";

/*
 * ============================================================
 * SECURITY ACCESS INDEX PROJECTION (user_access)
 * ============================================================
 *
 * `hasGlobalAccess()` / `hasScopedAccess()` in firestore.rules resolve
 * authorization from the `user_access` collection using deterministic
 * document ids:
 *
 *   {uid}__{permission}__global
 *   {uid}__{permission}__{scope_type}__{scope_id}
 *
 * Nothing in the application used to write those documents, so the only
 * election results a non-admin could ever read were the ones they
 * submitted themselves or the results for their own registered polling
 * unit — a ward or LGA coordinator fell back to nothing even though the
 * client claimed their whole scope.
 *
 * This module keeps the index in step with `organizational_assignments`,
 * which is the single source of truth for a member's geographic
 * authority. It is called from the assignment write path, so an
 * assignment is never granted without its access projection and an
 * assignment is never removed while its projection lingers.
 *
 * Rules constraints honoured here:
 *
 *   - `user_access` writes are admin-only, and every assignment write is
 *     already admin-only.
 *   - A create must carry `user_id` (string), `permission` (string) and
 *     `allowed` (bool).
 *   - Rules can only `get()` a document whose id they know, so the ids
 *     must be derived, never random.
 */

export const ELECTION_RESULTS_PERMISSION = "view_election_results";

/*
 * Positions that carry election-result visibility beyond the member's
 * own registered polling unit. A plain `campaign_member` assignment is a
 * location marker, not authority, so it deliberately grants nothing.
 */
const SCOPE_GRANTING_POSITIONS: OrganizationalPosition[] = [
  "ward_coordinator",
  "lga_coordinator",
  "zone_coordinator",
  "state_coordinator",
  "campaign_manager",
  "council_chairman",
];

interface AccessTarget {
  scope_type: ScopeType | "global";
  scope_id: string;
}

export function buildAccessDocId(
  userId: string,
  permission: string,
  scopeType: ScopeType | "global",
  scopeId: string,
): string {
  return scopeType === "global"
    ? `${userId}__${permission}__global`
    : `${userId}__${permission}__${scopeType}__${scopeId}`;
}

/*
 * Translate an assignment into the exact scope documents the rules look
 * for. Only `ward` and `polling_unit` scopes are consulted by
 * `canReadElectionResult()`, so an LGA (or wider) assignment is expanded
 * into the wards it covers using the electoral hierarchy.
 *
 * A senatorial zone cannot be expanded — the electoral dataset carries
 * no zone membership — so it grants nothing rather than something
 * broader than intended.
 */
async function resolveAccessTargets(
  scopeType: ScopeType,
  scopeId: string,
): Promise<AccessTarget[]> {
  switch (scopeType) {
    case "polling_unit":
      return scopeId ? [{ scope_type: "polling_unit", scope_id: scopeId }] : [];

    case "ward":
      return scopeId ? [{ scope_type: "ward", scope_id: scopeId }] : [];

    case "lga": {
      const target = (scopeId ?? "").trim().toLowerCase();
      if (!target) return [];

      const allLgas = await getAllEnuguLGAs();

      const match = allLgas.find((lga) => {
        const id = lga.id.toLowerCase();
        return (
          id === target ||
          id === target.replace(/-lga$/, "") ||
          `${id}-lga` === target
        );
      });

      if (!match) return [];

      return match.wards.map((ward) => ({
        scope_type: "ward" as const,
        scope_id: ward.id,
      }));
    }

    case "state":
    case "campaign":
      return [{ scope_type: "global", scope_id: "" }];

    default:
      return [];
  }
}

async function targetKeysForAssignment(
  userId: string,
  position: OrganizationalPosition,
  scopeType: ScopeType,
  scopeId: string,
): Promise<{ id: string; target: AccessTarget }[]> {
  if (!userId || !SCOPE_GRANTING_POSITIONS.includes(position)) return [];

  const targets = await resolveAccessTargets(scopeType, scopeId);

  return targets.map((target) => ({
    id: buildAccessDocId(
      userId,
      ELECTION_RESULTS_PERMISSION,
      target.scope_type,
      target.scope_id,
    ),
    target,
  }));
}

/*
 * Create the access projection for an assignment. Best effort: a failure
 * here is logged and swallowed so the assignment itself is never rolled
 * back by a projection problem (the rules will simply deny the extra
 * reads until the index catches up).
 */
export async function syncElectionResultAccessForAssignment(
  userId: string,
  position: OrganizationalPosition,
  scopeType: ScopeType,
  scopeId: string,
): Promise<void> {
  try {
    const entries = await targetKeysForAssignment(
      userId,
      position,
      scopeType,
      scopeId,
    );

    for (const { id, target } of entries) {
      await setDoc(
        doc(db, "user_access", id),
        {
          user_id: userId,
          permission: ELECTION_RESULTS_PERMISSION,
          allowed: true,
          scope_type: target.scope_type,
          scope_id: target.scope_id,
          updated_at: serverTimestamp(),
        },
        { merge: true },
      );
    }
  } catch (error) {
    console.warn(
      "Failed to project election result access for assignment:",
      error,
    );
  }
}

/*
 * Remove the projection for an assignment that was changed or deleted.
 */
export async function revokeElectionResultAccessForAssignment(
  userId: string,
  position: OrganizationalPosition,
  scopeType: ScopeType,
  scopeId: string,
): Promise<void> {
  try {
    const entries = await targetKeysForAssignment(
      userId,
      position,
      scopeType,
      scopeId,
    );

    for (const { id } of entries) {
      await deleteDoc(doc(db, "user_access", id));
    }
  } catch (error) {
    console.warn(
      "Failed to revoke election result access for assignment:",
      error,
    );
  }
}
