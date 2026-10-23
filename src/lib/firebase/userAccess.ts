import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "./config";
import { getAllEnuguLGAs } from "./electoral";

import {
  CAMPAIGN_PROJECTED_PERMISSIONS,
  ELECTION_RESULTS_PERMISSION,
  buildCampaignAccessDocId,
  buildBaselineAccessDocs,
  computeExpectedCampaignAccess,
  diffCampaignAccess,
  isCampaignProjectedAccessId,
  isCampaignProjectionEligible,
  resolveScopeTargets,
  type CampaignAccessAssignment,
  type CampaignAccessDoc,
  type CampaignAccessProfile,
} from "@/lib/campaign-access";

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
 * Nothing used to write those documents for a plain campaign member, so
 * every campign read gated on `hasAccess()` was denied ("Missing or
 * insufficient permissions") while the summary spinners hung. A
 * coordinator's projection was additive-only: changing position left
 * the previous position's grants in place, so users accumulated a union
 * of every position they had ever held — including permissions from the
 * pre-Supabase era and legacy `tenant_id` fields.
 *
 * The projection is now RECOMPUTED, not appended to:
 *
 *   expected = computeExpectedCampaignAccess(current state)
 *   delete  (recorded - expected)
 *   write   (expected - recorded)
 *
 * "Recorded" is the `access_projection_ids` array kept on the user's own
 * profile document. That avoids widening the `user_access` READ rule
 * (which is `allow read: if false`) just so the client can diff itself,
 * and it means the app never needs to list a collection it cannot read.
 *
 * The two projections live side by side:
 *
 *   campaign ....... baseline + coordinator grants (this file)
 *   election ....... view_election_results only. That permission is
 *                    NEVER deleted here, so the election projection
 *                    survives every campaign recompute.
 *
 * Rules constraints honoured:
 *
 *   - every document carries `user_id` (string), `permission` (string)
 *     and `allowed` (bool)
 *   - ids are derived, never random, because rules can only `get()` a
 *     document whose id they already know
 *   - no `tenant_id`, no permission outside `CAMPAIGN_PROJECTED_PERMISSIONS`
 */

/* ============================================================
 * CONSTANTS
 * ============================================================ */

export { ELECTION_RESULTS_PERMISSION };

/** Firestore caps a batch at 500 operations; stay clear of the edge. */
const WRITE_CHUNK = 450;

/** Profile field holding the ids of the documents this projection owns. */
export const ACCESS_PROJECTION_IDS_FIELD = "access_projection_ids";

/* ============================================================
 * TYPES
 * ============================================================ */

export interface CampaignProjectionResult {
  userId: string;
  /** Documents written in this run. */
  added: number;
  /** Documents deleted in this run. */
  deleted: number;
  /** Documents the user is expected to end up with. */
  total: number;
  /** Why the run wrote nothing, when it wrote nothing. */
  skipped?: string;
  /** Set when the run failed; the previous grants are left untouched. */
  error?: string;
}

interface ApplyOptions {
  /**
   * The profile as the caller knows it. Passed by signup so the first
   * projection does not depend on a read-back of a document that was
   * just written.
   */
  profile?: CampaignAccessProfile | null;
  /** Acting user, for diagnostics only. */
  actorId?: string | null;
  /** Record which ids were written. Off only for read-only planning. */
  persistIndex?: boolean;
}

/* ============================================================
 * BATCHED WRITES
 * ============================================================ */

function accessDocData(
  userId: string,
  doc: CampaignAccessDoc,
): Record<string, unknown> {
  return {
    user_id: userId,
    permission: doc.permission,
    allowed: true,
    scope_type: doc.scope_type,
    scope_id: doc.scope_id,
    updated_at: serverTimestamp(),
  };
}

/**
 * Apply a projection change.
 *
 * A change that fits in one batch is committed as ONE atomic batch, so
 * there is never a window with zero grants. A zone or state coordinator
 * projects more documents than Firestore allows in a batch (a zone is
 * roughly 1,000 rows); those are applied in chunks with the ADDS FIRST,
 * so the only possible window is one with surplus grants, never one
 * with missing ones.
 */
async function applyProjectionChange(
  userId: string,
  toAdd: CampaignAccessDoc[],
  toDelete: string[],
): Promise<void> {
  const total = toAdd.length + toDelete.length;

  if (total === 0) return;

  if (total <= WRITE_CHUNK) {
    const batch = writeBatch(db);

    for (const entry of toAdd) {
      /*
       * Full replace, not merge: a document that already carries legacy
       * fields (`tenant_id`) must come out clean, and the payload above
       * is the complete, current shape.
       */
      batch.set(doc(db, "user_access", entry.id), accessDocData(userId, entry));
    }

    for (const id of toDelete) {
      batch.delete(doc(db, "user_access", id));
    }

    await batch.commit();
    return;
  }

  for (let index = 0; index < toAdd.length; index += WRITE_CHUNK) {
    const chunk = toAdd.slice(index, index + WRITE_CHUNK);
    const batch = writeBatch(db);

    for (const entry of chunk) {
      batch.set(doc(db, "user_access", entry.id), accessDocData(userId, entry));
    }

    await batch.commit();
  }

  for (let index = 0; index < toDelete.length; index += WRITE_CHUNK) {
    const chunk = toDelete.slice(index, index + WRITE_CHUNK);
    const batch = writeBatch(db);

    for (const id of chunk) {
      batch.delete(doc(db, "user_access", id));
    }

    await batch.commit();
  }
}

/* ============================================================
 * READ HELPERS
 * ============================================================ */

function toProfile(data: Record<string, unknown> | undefined): CampaignAccessProfile {
  if (!data) return {};

  return {
    access_role:
      typeof data.access_role === "string" ? data.access_role : null,
    membership_types: Array.isArray(data.membership_types)
      ? (data.membership_types as string[])
      : [],
    lga_id: typeof data.lga_id === "string" ? data.lga_id : null,
    ward_id: typeof data.ward_id === "string" ? data.ward_id : null,
    polling_unit_id:
      typeof data.polling_unit_id === "string" ? data.polling_unit_id : null,
  };
}

function recordedProjectionIds(
  data: Record<string, unknown> | undefined,
): string[] {
  const value = data?.[ACCESS_PROJECTION_IDS_FIELD];

  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .filter((item) => isCampaignProjectedAccessId(item));
}

/**
 * Campaign grant documents that ACTUALLY exist for a user.
 *
 * `access_projection_ids` records what this projection wrote, but a
 * document written before that field existed (or by another writer) is
 * invisible to it — which is exactly how Chika kept a full set of
 * coordinator grants after being demoted to plain member: the diff
 * only ever compared against the recorded ids, so "not recorded" was
 * treated as "does not exist".
 *
 * Enumerating the collection is therefore required for the delete half
 * of the diff. It is allowed by the self-read clause on `user_access`
 * (firestore.rules), and it returns ONLY the caller's own documents.
 *
 * Election grants are excluded: `view_election_results` is owned by
 * another projection and must survive every campaign recompute.
 *
 * Best effort: when the read fails (older deployed rules, offline) the
 * recompute falls back to the recorded ids rather than deleting blind.
 */
interface ExistingCampaignAccess {
  /** Ids that exist for the user (campaign permissions only). */
  ids: string[];
  /**
   * Existing ids whose DOCUMENT is stale — a `tenant_id` field, a
   * legacy key, a mismatched permission/scope, or `allowed` not true.
   * They are deleted when no longer expected and rewritten when they
   * still are, so a stale field never survives a recompute.
   */
  staleIds: string[];
}

const ACCESS_DOC_FIELDS = new Set([
  "user_id",
  "permission",
  "allowed",
  "scope_type",
  "scope_id",
  "updated_at",
]);

function isStaleAccessDoc(
  id: string,
  userId: string,
  data: Record<string, unknown>,
): boolean {
  if (data.allowed !== true) return true;
  if (data.user_id !== userId) return true;

  const [, permission, scopeType] = id.split("__");

  if (data.permission !== permission) return true;
  if (data.scope_type !== scopeType) return true;

  /* `tenant_id` and any other legacy key. */
  return Object.keys(data).some((key) => !ACCESS_DOC_FIELDS.has(key));
}

async function loadExistingCampaignAccess(
  userId: string,
): Promise<ExistingCampaignAccess> {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, "user_access"),
        where("user_id", "==", userId),
      ),
    );

    const ids: string[] = [];
    const staleIds: string[] = [];

    for (const item of snapshot.docs) {
      if (!item.id.startsWith(`${userId}__`)) continue;
      if (!isCampaignProjectedAccessId(item.id)) continue;

      ids.push(item.id);

      if (isStaleAccessDoc(item.id, userId, item.data())) {
        staleIds.push(item.id);
      }
    }

    return { ids, staleIds };
  } catch (error) {
    console.warn(
      "Could not enumerate existing campaign access documents; " +
        "falling back to the recorded projection index:",
      error,
    );

    return { ids: [], staleIds: [] };
  }
}

/**
 * Active organizational assignments for a user.
 *
 * `where("user_id", "==", …)` alone keeps this on the automatic
 * single-field index; `status` is filtered in memory so the query does
 * not depend on a composite index.
 */
async function loadActiveAssignments(
  userId: string,
): Promise<CampaignAccessAssignment[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "organizational_assignments"),
      where("user_id", "==", userId),
    ),
  );

  return snapshot.docs
    .map((item) => item.data())
    .filter((data) => data.status === "active")
    .map((data) => ({
      position: data.position as OrganizationalPosition,
      scope_type: data.scope_type as ScopeType,
      scope_id: String(data.scope_id ?? ""),
      status: "active",
    }));
}

/* ============================================================
 * RECOMPUTE
 * ============================================================ */

/**
 * Recompute a user's campaign projection from their current state.
 *
 * Call this from EVERY trigger that can change the answer:
 *
 *   - organizational_assignment create / update / delete
 *   - access_role change
 *   - membership_types change
 *   - lga_id / ward_id / polling_unit_id change
 *
 * It is idempotent and safe to call when nothing changed: the diff is
 * empty and no write is issued.
 *
 * Best effort by design — a projection failure is reported, never
 * thrown, so the profile or assignment write that triggered it is not
 * rolled back (the rules simply deny the extra reads until the index
 * catches up).
 */
export async function syncCampaignAccessForUser(
  userId: string,
  options: ApplyOptions = {},
): Promise<CampaignProjectionResult> {
  const result: CampaignProjectionResult = {
    userId,
    added: 0,
    deleted: 0,
    total: 0,
  };

  if (!userId) {
    result.skipped = "no user id";
    return result;
  }

  try {
    const profileSnap = await getDoc(doc(db, "users", userId));
    const raw = profileSnap.exists() ? profileSnap.data() : undefined;

    const profile =
      options.profile !== undefined ? options.profile : toProfile(raw);

    const recorded = recordedProjectionIds(raw);

    if (!isCampaignProjectionEligible(profile)) {
      /*
       * Not eligible any more (campaign membership removed, election
       * officer, or no profile at all): everything this projection owns
       * goes, including documents that predate the recorded index. The
       * election projection is excluded by the diff.
       */
      const existing = await loadExistingCampaignAccess(userId);
      const toDelete = Array.from(
        new Set([...recorded, ...existing.ids]),
      );

      await applyProjectionChange(userId, [], toDelete);

      if (options.persistIndex !== false && profileSnap.exists()) {
        await updateDoc(doc(db, "users", userId), {
          [ACCESS_PROJECTION_IDS_FIELD]: [],
          updated_at: serverTimestamp(),
        });
      }

      result.deleted = toDelete.length;
      result.skipped = "not campaign eligible";
      return result;
    }

    const [assignments, lgas, existing] = await Promise.all([
      loadActiveAssignments(userId),
      getAllEnuguLGAs(),
      loadExistingCampaignAccess(userId),
    ]);

    const expected = computeExpectedCampaignAccess({
      userId,
      profile,
      assignments,
      lgas,
    });

    /*
     * The diff runs against what EXISTS, not only what was recorded. A
     * grant written before `access_projection_ids` existed, or at a
     * scope the user has since left, is deleted on the next recompute.
     */
    const known = Array.from(new Set([...recorded, ...existing.ids]));
    const { toAdd, toDelete } = diffCampaignAccess(expected, known);

    /*
     * An expected document that still carries stale fields is REWRITTEN
     * (full replace, see `applyProjectionChange`), so `tenant_id` and
     * legacy keys are cleaned up without a separate migration.
     */
    const stale = new Set(existing.staleIds);
    const alreadyAdding = new Set(toAdd.map((item) => item.id));

    for (const item of expected) {
      if (stale.has(item.id) && !alreadyAdding.has(item.id)) {
        toAdd.push(item);
        alreadyAdding.add(item.id);
      }
    }

    await applyProjectionChange(userId, toAdd, toDelete);

    if (options.persistIndex !== false && profileSnap.exists()) {
      await updateDoc(doc(db, "users", userId), {
        [ACCESS_PROJECTION_IDS_FIELD]: expected.map((item) => item.id),
        updated_at: serverTimestamp(),
      });
    }

    result.added = toAdd.length;
    result.deleted = toDelete.length;
    result.total = expected.length;
    return result;
  } catch (error) {
    console.warn("Failed to project campaign access:", error);

    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

/* ============================================================
 * BASELINE HELPERS
 * ============================================================ */

function baselineDocIds(
  userId: string,
  profile: CampaignAccessProfile | null | undefined,
): string[] {
  return buildBaselineAccessDocs(userId, profile).map((doc) => doc.id);
}

/**
 * Ensure the 9 baseline documents exist for a user.
 *
 * Additive: coordinator grants are untouched, and an already-correct
 * baseline costs no writes. Called on signup / admin member creation so
 * a brand-new plain member can read their own area immediately.
 *
 * Also records the baseline ids on the profile so a later recompute can
 * remove them.
 */
export async function ensureBaselineCampaignProjection(
  userId: string,
  options: ApplyOptions = {},
): Promise<CampaignProjectionResult> {
  const result: CampaignProjectionResult = {
    userId,
    added: 0,
    deleted: 0,
    total: 0,
  };

  if (!userId) {
    result.skipped = "no user id";
    return result;
  }

  try {
    const profileSnap = await getDoc(doc(db, "users", userId));
    const raw = profileSnap.exists() ? profileSnap.data() : undefined;

    const profile =
      options.profile !== undefined ? options.profile : toProfile(raw);

    const baseline = buildBaselineAccessDocs(userId, profile);
    const recorded = recordedProjectionIds(raw);

    if (baseline.length === 0) {
      result.skipped = "not baseline eligible";
      return result;
    }

    const recordedSet = new Set(recorded);
    const toAdd = baseline.filter((doc) => !recordedSet.has(doc.id));

    if (toAdd.length > 0) {
      const batch = writeBatch(db);

      for (const entry of toAdd) {
        batch.set(
          doc(db, "user_access", entry.id),
          accessDocData(userId, entry),
        );
      }

      await batch.commit();
    }

    if (options.persistIndex !== false && profileSnap.exists()) {
      const merged = Array.from(
        new Set([...recorded, ...baseline.map((doc) => doc.id)]),
      );

      await updateDoc(doc(db, "users", userId), {
        [ACCESS_PROJECTION_IDS_FIELD]: merged,
        updated_at: serverTimestamp(),
      });
    }

    result.added = toAdd.length;
    result.total = baseline.length;
    return result;
  } catch (error) {
    console.warn("Failed to ensure baseline campaign access:", error);

    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

/**
 * Remove every baseline document recorded for a user.
 *
 * Used when a member stops being baseline-eligible (campaign membership
 * removed, home area cleared). `syncCampaignAccessForUser()` performs
 * the same removal as part of a full recompute; this helper exists for
 * callers that must drop the baseline without recomputing anything
 * else.
 */
export async function removeBaselineCampaignProjection(
  userId: string,
): Promise<CampaignProjectionResult> {
  const result: CampaignProjectionResult = {
    userId,
    added: 0,
    deleted: 0,
    total: 0,
  };

  if (!userId) {
    result.skipped = "no user id";
    return result;
  }

  try {
    const profileSnap = await getDoc(doc(db, "users", userId));
    if (!profileSnap.exists()) {
      result.skipped = "no profile";
      return result;
    }

    const raw = profileSnap.data();
    const profile = toProfile(raw);

    const baselineIds = new Set(baselineDocIds(userId, profile));
    const recorded = recordedProjectionIds(raw);

    /*
     * Without a home area the baseline ids cannot be derived (there is
     * no area to derive them from), so the only correct removal is the
     * full recompute — which drops every campaign document.
     */
    if (baselineIds.size === 0) {
      return syncCampaignAccessForUser(userId);
    }

    const toDelete = recorded.filter((id) => baselineIds.has(id));

    await applyProjectionChange(userId, [], toDelete);

    await updateDoc(doc(db, "users", userId), {
      [ACCESS_PROJECTION_IDS_FIELD]: recorded.filter(
        (id) => !toDelete.includes(id),
      ),
      updated_at: serverTimestamp(),
    });

    result.deleted = toDelete.length;
    return result;
  } catch (error) {
    console.warn("Failed to remove baseline campaign access:", error);

    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

/* ============================================================
 * ELECTION RESULT PROJECTION
 * ============================================================
 *
 * Unchanged in behaviour: it writes and revokes exactly one permission
 * (`view_election_results`) and enumerates polling units, because
 * election reads have no ward stamp to fall back on.
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

async function electionResultDocIds(
  userId: string,
  position: OrganizationalPosition,
  scopeType: ScopeType,
  scopeId: string,
): Promise<string[]> {
  if (!userId || !SCOPE_GRANTING_POSITIONS.includes(position)) return [];

  const lgas = await getAllEnuguLGAs();
  const targets = resolveScopeTargets(scopeType, scopeId, lgas).flatMap(
    (target) => {
      if (target.scope_type === "global") return [target];

      if (target.scope_type !== "lga") return [target];

      /* Election results need the polling units too. */
      const lga = lgas.find((item) => item.id === target.scope_id);
      if (!lga) return [target];

      return [
        target,
        ...lga.wards.flatMap((ward) =>
          ward.pollingUnits.map((unit) => ({
            scope_type: "polling_unit" as const,
            scope_id: unit.id,
          })),
        ),
      ];
    },
  );

  return targets.map((target) =>
    buildCampaignAccessDocId(
      userId,
      ELECTION_RESULTS_PERMISSION,
      target.scope_type,
      target.scope_id,
    ),
  );
}

/*
 * Create the access projection for an assignment. Best effort: a failure
 * here is logged and swallowed so the assignment itself is never rolled
 * back by a projection problem.
 */
export async function syncElectionResultAccessForAssignment(
  userId: string,
  position: OrganizationalPosition,
  scopeType: ScopeType,
  scopeId: string,
): Promise<void> {
  try {
    const ids = await electionResultDocIds(
      userId,
      position,
      scopeType,
      scopeId,
    );

    for (let index = 0; index < ids.length; index += WRITE_CHUNK) {
      const chunk = ids.slice(index, index + WRITE_CHUNK);
      const batch = writeBatch(db);

      for (const id of chunk) {
        const scopeTypeFromId = id.split("__")[2];
        const scopeIdFromId =
          scopeTypeFromId === "global"
            ? ""
            : id.split("__").slice(3).join("__");

        batch.set(
          doc(db, "user_access", id),
          {
            user_id: userId,
            permission: ELECTION_RESULTS_PERMISSION,
            allowed: true,
            scope_type: scopeTypeFromId,
            scope_id: scopeIdFromId,
            updated_at: serverTimestamp(),
          },
          { merge: true },
        );
      }

      await batch.commit();
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
    const ids = await electionResultDocIds(
      userId,
      position,
      scopeType,
      scopeId,
    );

    for (let index = 0; index < ids.length; index += WRITE_CHUNK) {
      const chunk = ids.slice(index, index + WRITE_CHUNK);
      const batch = writeBatch(db);

      for (const id of chunk) {
        batch.delete(doc(db, "user_access", id));
      }

      await batch.commit();
    }
  } catch (error) {
    console.warn(
      "Failed to revoke election result access for assignment:",
      error,
    );
  }
}

/* ============================================================
 * INTROSPECTION (scripts / diagnostics)
 * ============================================================ */

/** The campaign projection matrix, for diagnostics and docs. */
export { CAMPAIGN_PROJECTED_PERMISSIONS };
