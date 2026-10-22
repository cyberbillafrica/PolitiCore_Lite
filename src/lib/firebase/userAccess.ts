import {
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "./config";
import { getAllEnuguLGAs } from "./electoral";

import { lookupConstituencyLgaIds } from "@/data/constituencies";

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
 * Nothing used to write those documents for campaign permissions, so
 * every non-admin campaign write (activity create, report submit,
 * issue raise) was denied by the rules even though the UI offered it.
 * This module keeps the index in step with `organizational_assignments`,
 * which is the single source of truth for a member's geographic
 * authority, and is called from the assignment write path.
 *
 * Scope expansion:
 *
 *   state / campaign .... one global document per permission
 *   senatorial_zone ..... the zone's LGAs and their wards
 *   lga ................. the LGA and its wards
 *   ward ................ the ward
 *   polling_unit ........ the polling unit
 *
 * Polling units are deliberately NOT enumerated. Every campaign
 * document that can be scoped to a PU also carries the ward it belongs
 * to (`scope_ward_id` / `target_ward_id`), and the rules fall back to
 * the ward-level grant. That keeps a zone assignment to a few hundred
 * index rows instead of several thousand.
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
  "pu_coordinator",
  "ward_coordinator",
  "lga_coordinator",
  "zone_coordinator",
  "state_coordinator",
  "campaign_manager",
  "council_chairman",
];

/*
 * The campaign permissions each position implies. This mirrors the
 * position matrix in `src/lib/permissions.ts` — it is the subset the
 * Firestore rules actually consult.
 */
const CAMPAIGN_PERMISSIONS: Record<OrganizationalPosition, string[]> = {
  campaign_member: [
    "view_members",
    "view_assignments",
    "view_activities",
    "submit_field_report",
    "report_issue",
  ],
  pu_coordinator: [
    "view_members",
    "view_assignments",
    "create_assignment",
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

/* ============================================================
 * SCOPE EXPANSION
 * ============================================================ */

/**
 * Expand an assignment scope into the documents the rules look for.
 *
 * `includePollingUnits` stays false for campaign permissions (the ward
 * stamp covers PU documents) and is used by the election projection,
 * which has no such stamp.
 */
async function resolveAccessTargets(
  scopeType: ScopeType,
  scopeId: string,
  includePollingUnits = false,
): Promise<AccessTarget[]> {
  const id = (scopeId ?? "").trim();
  if (!id) return [];

  switch (scopeType) {
    case "polling_unit":
      return [{ scope_type: "polling_unit", scope_id: id }];

    case "ward":
      return [{ scope_type: "ward", scope_id: id }];

    case "lga": {
      const allLgas = await getAllEnuguLGAs();
      const target = id.toLowerCase();

      const match = allLgas.find((lga) => {
        const lgaId = lga.id.toLowerCase();
        return (
          lgaId === target ||
          lgaId === target.replace(/-lga$/, "") ||
          `${lgaId}-lga` === target
        );
      });

      if (!match) return [];

      const targets: AccessTarget[] = [
        { scope_type: "lga", scope_id: match.id },
        ...match.wards.map((ward) => ({
          scope_type: "ward" as const,
          scope_id: ward.id,
        })),
      ];

      if (includePollingUnits) {
        targets.push(
          ...match.wards.flatMap((ward) =>
            ward.pollingUnits.map((unit) => ({
              scope_type: "polling_unit" as const,
              scope_id: unit.id,
            })),
          ),
        );
      }

      return targets;
    }

    case "senatorial_zone": {
      const zoneLgaIds = lookupConstituencyLgaIds({
        scope_type: "senatorial_zone",
        scope_id: id,
      });

      if (zoneLgaIds.length === 0) return [];

      const allLgas = await getAllEnuguLGAs();
      const zoneIds = zoneLgaIds.map((item) => item.toLowerCase());

      const covered = allLgas.filter((lga) =>
        zoneIds.includes(lga.id.toLowerCase()),
      );

      const targets: AccessTarget[] = [
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

      if (includePollingUnits) {
        targets.push(
          ...covered.flatMap((lga) =>
            lga.wards.flatMap((ward) =>
              ward.pollingUnits.map((unit) => ({
                scope_type: "polling_unit" as const,
                scope_id: unit.id,
              })),
            ),
          ),
        );
      }

      return targets;
    }

    case "state":
    case "campaign":
      return [{ scope_type: "global", scope_id: "" }];

    default:
      return [];
  }
}

/* ============================================================
 * BATCHED WRITES
 * ============================================================ */

const BATCH_LIMIT = 400;

async function writeAccessDocs(
  entries: Array<{ id: string; data: Record<string, unknown> }>,
): Promise<void> {
  for (let index = 0; index < entries.length; index += BATCH_LIMIT) {
    const chunk = entries.slice(index, index + BATCH_LIMIT);
    const batch = writeBatch(db);

    for (const entry of chunk) {
      batch.set(doc(db, "user_access", entry.id), entry.data, { merge: true });
    }

    await batch.commit();
  }
}

async function deleteAccessDocs(ids: string[]): Promise<void> {
  for (let index = 0; index < ids.length; index += BATCH_LIMIT) {
    const chunk = ids.slice(index, index + BATCH_LIMIT);
    const batch = writeBatch(db);

    for (const id of chunk) {
      batch.delete(doc(db, "user_access", id));
    }

    await batch.commit();
  }
}

/* ============================================================
 * CAMPAIGN PERMISSION PROJECTION
 * ============================================================ */

function campaignAccessIds(
  userId: string,
  position: OrganizationalPosition,
  targets: AccessTarget[],
): Array<{ id: string; target: AccessTarget; permission: string }> {
  const permissions = CAMPAIGN_PERMISSIONS[position] ?? [];

  return permissions.flatMap((permission) =>
    targets.map((target) => ({
      id: buildAccessDocId(
        userId,
        permission,
        target.scope_type,
        target.scope_id,
      ),
      target,
      permission,
    })),
  );
}

export async function syncCampaignAccessForAssignment(
  userId: string,
  position: OrganizationalPosition,
  scopeType: ScopeType,
  scopeId: string,
): Promise<void> {
  try {
    if (!userId) return;

    const targets = await resolveAccessTargets(scopeType, scopeId, false);
    if (targets.length === 0) return;

    const entries = campaignAccessIds(userId, position, targets).map(
      ({ id, target, permission }) => ({
        id,
        data: {
          user_id: userId,
          permission,
          allowed: true,
          scope_type: target.scope_type,
          scope_id: target.scope_id,
          updated_at: serverTimestamp(),
        },
      }),
    );

    await writeAccessDocs(entries);
  } catch (error) {
    console.warn(
      "Failed to project campaign access for assignment:",
      error,
    );
  }
}

export async function revokeCampaignAccessForAssignment(
  userId: string,
  position: OrganizationalPosition,
  scopeType: ScopeType,
  scopeId: string,
): Promise<void> {
  try {
    if (!userId) return;

    const targets = await resolveAccessTargets(scopeType, scopeId, false);
    if (targets.length === 0) return;

    const ids = campaignAccessIds(userId, position, targets).map(
      (entry) => entry.id,
    );

    await deleteAccessDocs(Array.from(new Set(ids)));
  } catch (error) {
    console.warn("Failed to revoke campaign access for assignment:", error);
  }
}

/* ============================================================
 * ELECTION RESULT PROJECTION
 * ============================================================ */

async function targetKeysForAssignment(
  userId: string,
  position: OrganizationalPosition,
  scopeType: ScopeType,
  scopeId: string,
): Promise<{ id: string; target: AccessTarget }[]> {
  if (!userId || !SCOPE_GRANTING_POSITIONS.includes(position)) return [];

  const targets = await resolveAccessTargets(scopeType, scopeId, true);

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

    await writeAccessDocs(
      entries.map(({ id, target }) => ({
        id,
        data: {
          user_id: userId,
          permission: ELECTION_RESULTS_PERMISSION,
          allowed: true,
          scope_type: target.scope_type,
          scope_id: target.scope_id,
          updated_at: serverTimestamp(),
        },
      })),
    );
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

    await deleteAccessDocs(entries.map((entry) => entry.id));
  } catch (error) {
    console.warn(
      "Failed to revoke election result access for assignment:",
      error,
    );
  }
}

/*
 * Exported for the verification script: the exact document ids an
 * assignment projects, without touching Firestore.
 */
export async function previewCampaignAccessIds(
  userId: string,
  position: OrganizationalPosition,
  scopeType: ScopeType,
  scopeId: string,
): Promise<string[]> {
  const targets = await resolveAccessTargets(scopeType, scopeId, false);
  return Array.from(
    new Set(campaignAccessIds(userId, position, targets).map((e) => e.id)),
  );
}
