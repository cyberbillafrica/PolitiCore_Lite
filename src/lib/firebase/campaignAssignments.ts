"use client";

/*
 * ============================================================
 * CAMPAIGN ASSIGNMENTS
 * ============================================================
 *
 * An assignment targets one person, a scope, or both:
 *
 *   { assigned_to_user }                       individual
 *   { assigned_to_scope }                      per_person
 *   { assigned_to_user, assigned_to_scope }    both
 *
 * Legacy documents written before Round 5 carry
 * `assigned_to` / `assigned_by` / `scope_type` / `scope_id` only. The
 * mapper accepts either shape, and new documents keep writing the
 * legacy fields so nothing that still reads them breaks.
 *
 * Per-person completions live at
 *   campaign_assignments/{id}/completions/{uid}
 * and are only used when `completion_mode` is "per_person".
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Query,
} from "firebase/firestore";

import { db } from "@/lib/firebase/config";
import { dateOnlyFromValue, dateOnlyToTimestamp } from "@/lib/campaign-dates";
import { campaignRead } from "./query-debug";
import { resolveCampaignScope, type CampaignScope } from "@/lib/campaign-scope";
import {
  chunkIds,
  grantScopes,
  grantWardIds,
  groupScopeQueries,
  hasGlobalScope,
  type ViewerGrant,
} from "@/lib/campaign-read-scope";

import type {
  AssignmentCompletion,
  AssignmentCompletionStatus,
  AssignmentScope,
  CampaignAssignment,
  ScopeType,
} from "@/types";

export type { CampaignAssignment } from "@/types";

const COLLECTION = "campaign_assignments";
const COMPLETIONS = "completions";

/* ============================================================
 * MAPPING
 * ============================================================ */

function asScope(value: unknown): AssignmentScope | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const level = typeof record.level === "string" ? record.level : "";
  const scopeId = typeof record.scope_id === "string" ? record.scope_id : "";

  if (!level || !scopeId) return null;

  return {
    level: level as ScopeType,
    scope_id: scopeId,
    role_filter:
      typeof record.role_filter === "string" && record.role_filter
        ? (record.role_filter as AssignmentScope["role_filter"])
        : null,
  };
}

/**
 * Legacy status values map onto the two-state model:
 * anything that finished is closed; everything else is open.
 */
function asStatus(value: unknown): CampaignAssignment["status"] {
  const raw = String(value ?? "");
  if (raw === "closed" || raw === "completed") return "closed";
  return "open";
}

function mapAssignment(
  id: string,
  data: Record<string, unknown>,
): CampaignAssignment {
  const assignedToUser =
    typeof data.assigned_to_user === "string" && data.assigned_to_user
      ? data.assigned_to_user
      : typeof data.assigned_to === "string" && data.assigned_to
        ? data.assigned_to
        : null;

  const assignedToScope = asScope(data.assigned_to_scope);

  /*
   * Legacy rows stored a bare scope_type/scope_id pair. Treat that as
   * a scope target when the row was not addressed to one person.
   */
  const legacyScope =
    !assignedToScope &&
    typeof data.scope_type === "string" &&
    typeof data.scope_id === "string" &&
    data.scope_id
      ? {
          level: data.scope_type as ScopeType,
          scope_id: String(data.scope_id),
          role_filter: null,
        }
      : null;

  const createdBy =
    typeof data.created_by === "string" && data.created_by
      ? data.created_by
      : String(data.assigned_by ?? "");

  const scope = assignedToScope ?? legacyScope;
  const completionMode =
    data.completion_mode === "per_person" || data.completion_mode === "individual"
      ? data.completion_mode
      : scope
        ? "per_person"
        : "individual";

  return {
    id,
    title: String(data.title ?? ""),
    description:
      typeof data.description === "string" && data.description
        ? data.description
        : undefined,
    created_by: createdBy,
    created_at: data.created_at,
    updated_at: data.updated_at,
    /* Round 8 stores the date as a timestamp; older rows are strings. */
    due_at: dateOnlyFromValue(data.due_at) ?? dateOnlyFromValue(data.due_date),
    assigned_to_user: assignedToUser,
    assigned_to_scope: scope,
    assigned_to: assignedToUser ?? "",
    status: asStatus(data.status),
    completion_mode: completionMode,
    priority:
      (data.priority as CampaignAssignment["priority"]) ?? "medium",
    created_scope: asScope(data.created_scope),
  };
}

/* ============================================================
 * READS
 * ============================================================ */

/**
 * Every assignment.
 *
 * UNSAFE for a non-admin: the campaign_assignments read clauses gate each
 * document
 * on its assignee, creator or scope, so an unfiltered list is only
 * provable for an admin or a GLOBAL `view_assignments` grant (a
 * state-scoped coordinator). Everything else must use
 * `getAssignmentsForUser()` / `getAssignmentsInScope()`.
 */
export async function getAllCampaignAssignments(
  options: { db?: Firestore } = {},
): Promise<CampaignAssignment[]> {
  const database = options.db ?? db;

  const snapshot = await campaignRead(
    { collection: COLLECTION, filter: { all: true } },
    () =>
      getDocs(
        query(collection(database, COLLECTION), orderBy("created_at", "desc")),
      ),
  );

  return snapshot.docs.map((item) => mapAssignment(item.id, item.data()));
}

/**
 * Assignments directly addressed to the user.
 *
 * Queries both `assigned_to_user` and the legacy `assigned_to` field so
 * pre-Round-5 rows stay visible.
 */
export async function getAssignmentsForUser(
  userId: string,
): Promise<CampaignAssignment[]> {
  if (!userId) return [];

  const byId = new Map<string, CampaignAssignment>();

  const queries: Query[] = [
    query(collection(db, COLLECTION), where("assigned_to_user", "==", userId)),
    query(collection(db, COLLECTION), where("assigned_to", "==", userId)),
    query(collection(db, COLLECTION), where("created_by", "==", userId)),
    query(collection(db, COLLECTION), where("assigned_by", "==", userId)),
  ];

  for (const q of queries) {
    const snapshot = await campaignRead(
      { collection: COLLECTION, filter: { matched_user: userId } },
      () => getDocs(q),
    );

    for (const document of snapshot.docs) {
      byId.set(document.id, mapAssignment(document.id, document.data()));
    }
  }

  return sortAssignments(Array.from(byId.values()));
}

/**
 * Scope-targeted assignments visible to the viewer's resolved scope.
 *
 * Every query below constrains a field the rules actually read
 * (`scope_type`/`scope_id` and `target_ward_id`), so each one is
 * provable for a viewer holding the matching grant.
 *
 * A plain member's authority is a single polling unit: their own-level
 * query is provable (`view_assignments` at their PU, from the
 * baseline), but a `target_ward_id` query is NOT, because they hold no
 * ward-level grant. That is why the ward-stamp query is restricted to
 * coordinators instead of using the geographic ward list blindly.
 */
export async function getAssignmentsInScope(
  scope: CampaignScope | null,
  grants: ViewerGrant[],
  options: { db?: Firestore; viewerId?: string } = {},
): Promise<CampaignAssignment[]> {
  if (!scope?.level || !scope.scope_id) return [];

  const database = options.db ?? db;
  const scopes = grantScopes(grants, ["view_assignments"]);

  if (
    scope.level === "state" ||
    scope.level === "campaign" ||
    hasGlobalScope(scopes)
  ) {
    return sortAssignments(await getAllCampaignAssignments(options));
  }

  const byId = new Map<string, CampaignAssignment>();

  const collect = (documents: Array<{ id: string; data: () => Record<string, unknown> }>) => {
    for (const document of documents) {
      byId.set(document.id, mapAssignment(document.id, document.data()));
    }
  };

  /* 1. Scope-targeted work at every level the viewer holds. */
  const { groups } = groupScopeQueries(scopes);

  for (const group of groups) {
    for (const chunk of chunkIds(group.scope_ids)) {
      const snapshot = await campaignRead(
        {
          collection: COLLECTION,
          filter: { scope_type: group.scope_type, scope_id: chunk },
        },
        () =>
          getDocs(
            query(
              collection(database, COLLECTION),
              where("scope_type", "==", group.scope_type),
              where("scope_id", "in", chunk),
            ),
          ),
      );

      collect(snapshot.docs);
    }
  }

  /*
   * 2. Any target whose ward is inside the viewer's AUTHORITY.
   *
   * A ward stamp is readable only through a WARD `view_assignments`
   * grant, so this is restricted to granted wards and skipped below
   * ward level (a PU member's own PU query already covers their PU).
   */
  const scopeWards = new Set(
    scope.level === "polling_unit" ? [] : (scope.wardIds ?? []),
  );

  const stampedWardIds = grantWardIds(grants, ["view_assignments"]).filter(
    (wardId) => scopeWards.has(wardId),
  );

  for (const chunk of chunkIds(stampedWardIds)) {
    const snapshot = await campaignRead(
      { collection: COLLECTION, filter: { target_ward_id: chunk } },
      () =>
        getDocs(
          query(
            collection(database, COLLECTION),
            where("target_ward_id", "in", chunk),
          ),
        ),
    );

    collect(snapshot.docs);
  }

  /*
   * 3. Work addressed to the viewer personally, or created by them.
   *
   * Both are single-field equalities on clauses the rules already have
   * (`assigned_to_user` / `created_by`), so they are provable without a
   * scope grant — an individual assignment has no scope to match.
   */
  if (options.viewerId) {
    const personal: Query[] = [
      query(
        collection(database, COLLECTION),
        where("assigned_to_user", "==", options.viewerId),
      ),
      query(
        collection(database, COLLECTION),
        where("created_by", "==", options.viewerId),
      ),
    ];

    for (const q of personal) {
      const snapshot = await campaignRead(
        {
          collection: COLLECTION,
          filter: { viewer: options.viewerId },
        },
        () => getDocs(q),
      );

      collect(snapshot.docs);
    }
  }

  return sortAssignments(Array.from(byId.values()));
}

function sortAssignments(items: CampaignAssignment[]): CampaignAssignment[] {
  return [...items].sort((a, b) => {
    const left = a.created_at ? String(a.created_at) : "";
    const right = b.created_at ? String(b.created_at) : "";
    return right.localeCompare(left);
  });
}

export async function getCampaignAssignment(
  assignmentId: string,
): Promise<CampaignAssignment | null> {
  if (!assignmentId) return null;

  const snapshot = await getDoc(doc(db, COLLECTION, assignmentId));
  if (!snapshot.exists()) return null;

  return mapAssignment(snapshot.id, snapshot.data());
}

/* ============================================================
 * WRITES
 * ============================================================ */

export interface CreateAssignmentInput {
  title: string;
  description?: string;

  created_by: string;

  assigned_to_user?: string | null;
  assigned_to_scope?: AssignmentScope | null;

  due_at?: string | null;
  priority?: CampaignAssignment["priority"];

  created_scope?: { level: ScopeType; scope_id: string } | null;

  /** Ward the target belongs to, used for scoped reads. */
  target_ward_id?: string | null;
}

/**
 * Create an assignment.
 *
 * `completion_mode` is derived: a scope target always produces
 * per-person tracking; an individual target produces one completion.
 */
export async function createCampaignAssignment(
  input: CreateAssignmentInput,
): Promise<string> {
  if (!input.assigned_to_user && !input.assigned_to_scope) {
    throw new Error(
      "An assignment must target a member, a scope, or both.",
    );
  }

  const scope = input.assigned_to_scope ?? null;
  const completionMode = scope ? "per_person" : "individual";

  /*
   * A date-only due date is stored at local midnight so the create and
   * update rules can compare it with `request.time`.
   */
  const dueDate = dateOnlyToTimestamp(input.due_at);

  const document: Record<string, unknown> = {
    title: input.title.trim(),
    created_by: input.created_by,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),

    status: "open",
    completion_mode: completionMode,

    priority: input.priority ?? "medium",
    due_at: dueDate,

    assigned_to_user: input.assigned_to_user || null,
    assigned_to_scope: scope,

    /* Legacy fields — kept so older readers keep working. */
    assigned_to: input.assigned_to_user || "",
    assigned_by: input.created_by,
    scope_type: scope?.level ?? "",
    scope_id: scope?.scope_id ?? "",
    due_date: dueDate,

    created_scope: input.created_scope ?? null,
    target_ward_id: input.target_ward_id ?? null,
  };

  if (input.description?.trim()) {
    document.description = input.description.trim();
  }

  const ref = await addDoc(collection(db, COLLECTION), document);

  /*
   * When the target is a scope, every targeted member gets their own
   * pending completion row so the creator can track them individually.
   */
  if (scope) {
    const targetIds = await resolveTargetMemberIds({
      scope,
      assigned_to_user: input.assigned_to_user ?? null,
    });

    await seedCompletions(ref.id, targetIds);
  }

  return ref.id;
}

export async function updateCampaignAssignment(
  assignmentId: string,
  data: Partial<{
    title: string;
    description: string;
    due_at: string | null;
    priority: CampaignAssignment["priority"];
    status: CampaignAssignment["status"];
  }>,
): Promise<void> {
  const updates: Record<string, unknown> = {
    ...data,
    updated_at: serverTimestamp(),
  };

  /*
   * `due_at` is the date the form edits; keep the paired `due_date`
   * field in step so the rules validate the same value on both.
   */
  if ("due_at" in data) {
    const dueDate = dateOnlyToTimestamp(data.due_at);

    updates.due_at = dueDate;
    updates.due_date = dueDate;
  }

  await updateDoc(doc(db, COLLECTION, assignmentId), updates);
}

export async function setAssignmentStatus(
  assignmentId: string,
  status: CampaignAssignment["status"],
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, assignmentId), {
    status,
    updated_at: serverTimestamp(),
  });
}

export async function deleteCampaignAssignment(
  assignmentId: string,
): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, assignmentId));
}

/* ============================================================
 * COMPLETIONS
 * ============================================================ */

/**
 * Members a scope target resolves to.
 *
 * Kept in this module (rather than importing the member loader) so an
 * assignment write never depends on the member page's view model.
 * `role_filter` narrows the set to one position, resolved from
 * `organizational_assignments`.
 */
async function resolveTargetMemberIds(input: {
  scope: AssignmentScope;
  assigned_to_user: string | null;
}): Promise<string[]> {
  const resolved = await resolveCampaignScope(
    input.scope.level,
    input.scope.scope_id,
  );

  if (!resolved) return input.assigned_to_user ? [input.assigned_to_user] : [];

  const { getCampaignMembersInScope } = await import(
    "@/lib/firebase/campaignMembers"
  );

  const members = await getCampaignMembersInScope(resolved);

  let ids = members.map((member) => member.id);

  if (input.scope.role_filter) {
    const assignmentSnapshot = await getDocs(
      query(
        collection(db, "organizational_assignments"),
        where("position", "==", input.scope.role_filter),
        where("status", "==", "active"),
      ),
    );

    const allowed = new Set(
      assignmentSnapshot.docs.map((item) => String(item.data().user_id ?? "")),
    );

    ids = ids.filter((id) => allowed.has(id));
  }

  if (input.assigned_to_user) {
    ids = Array.from(new Set([...ids, input.assigned_to_user]));
  }

  return ids;
}

async function seedCompletions(
  assignmentId: string,
  userIds: string[],
): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return;

  for (let index = 0; index < unique.length; index += 450) {
    const chunk = unique.slice(index, index + 450);
    const batch = writeBatch(db);

    for (const userId of chunk) {
      batch.set(
        doc(db, COLLECTION, assignmentId, COMPLETIONS, userId),
        {
          assignment_id: assignmentId,
          user_id: userId,
          status: "pending" satisfies AssignmentCompletionStatus,
          submitted_at: null,
          reviewed_at: null,
          reviewed_by: null,
          report_id: null,
          updated_at: serverTimestamp(),
        },
        { merge: true },
      );
    }

    await batch.commit();
  }
}

export async function getAssignmentCompletions(
  assignmentId: string,
): Promise<AssignmentCompletion[]> {
  if (!assignmentId) return [];

  /*
   * Creator/admin only by rule. Callers must gate this read: a member
   * who was merely targeted by the assignment cannot list the whole
   * completion set, and an unprovable list fails as a whole.
   */
  const snapshot = await campaignRead(
    {
      collection: `${COLLECTION}/${assignmentId}/${COMPLETIONS}`,
      filter: { all: true },
    },
    () => getDocs(collection(db, COLLECTION, assignmentId, COMPLETIONS)),
  );

  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      assignment_id: String(data.assignment_id ?? assignmentId),
      user_id: String(data.user_id ?? item.id),
      status: (data.status as AssignmentCompletionStatus) ?? "pending",
      submitted_at: data.submitted_at,
      reviewed_at: data.reviewed_at,
      reviewed_by: typeof data.reviewed_by === "string" ? data.reviewed_by : null,
      review_notes:
        typeof data.review_notes === "string" ? data.review_notes : null,
      report_id: typeof data.report_id === "string" ? data.report_id : null,
      updated_at: data.updated_at,
    };
  });
}

/**
 * Record that a member submitted a completion, linked to their report.
 */
export async function markCompletionSubmitted(
  assignmentId: string,
  userId: string,
  reportId: string,
): Promise<void> {
  await updateDoc(
    doc(db, COLLECTION, assignmentId, COMPLETIONS, userId),
    {
      assignment_id: assignmentId,
      user_id: userId,
      status: "submitted",
      submitted_at: serverTimestamp(),
      report_id: reportId,
      updated_at: serverTimestamp(),
    },
  );
}

/**
 * Creator decision on one member's completion.
 */
export async function reviewCompletion(input: {
  assignmentId: string;
  userId: string;
  status: "approved" | "rejected";
  reviewedBy: string;
  notes?: string | null;
}): Promise<void> {
  await updateDoc(
    doc(db, COLLECTION, input.assignmentId, COMPLETIONS, input.userId),
    {
      status: input.status,
      reviewed_by: input.reviewedBy,
      reviewed_at: serverTimestamp(),
      review_notes: input.notes?.trim() || null,
      updated_at: serverTimestamp(),
    },
  );
}

/**
 * Close the parent assignment when every completion is approved.
 * Returns true when the write happened.
 */
export async function closeAssignmentIfComplete(
  assignmentId: string,
): Promise<boolean> {
  const completions = await getAssignmentCompletions(assignmentId);

  if (completions.length === 0) return false;
  if (!completions.every((item) => item.status === "approved")) return false;

  await setAssignmentStatus(assignmentId, "closed");
  return true;
}

/* ============================================================
 * SCOPE RESOLUTION FOR WRITES
 * ============================================================ */

/**
 * The ward a scope target belongs to, used for scoped reads of the
 * assignment. Returns null for state / zone / LGA targets, which are
 * readable through their own scope document instead.
 */
export async function targetWardIdForScope(
  scope: AssignmentScope | null,
): Promise<string | null> {
  if (!scope) return null;

  if (scope.level === "ward") return scope.scope_id;

  if (scope.level === "polling_unit") {
    const resolved = await resolveCampaignScope("polling_unit", scope.scope_id);
    return resolved?.wardIds[0] ?? null;
  }

  return null;
}
