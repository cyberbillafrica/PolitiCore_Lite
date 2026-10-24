"use client";

/*
 * ============================================================
 * CAMPAIGN ISSUES
 * ============================================================
 *
 * Issues cascade UP. A PU member's issue is visible to that member,
 * to every coordinator whose scope covers it (ward -> LGA -> zone ->
 * state), and to admin. A coordinator sees issues at their own scope
 * and everything below it.
 *
 * The document lives in `issues` (the collection the rules already
 * cover) and carries both the Round 5 names and the legacy ones so
 * existing rows keep working:
 *
 *   raised_by   <- reported_by
 *   raised_at   <- created_at
 *   scope_level <- scope_type
 *
 * `scope_ward_id` is stamped on write so a coordinator can pull every
 * issue inside their wards with one `in` query instead of one query
 * per polling unit.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";

import { db } from "./config";
import { campaignRead } from "./query-debug";
import {
  notifyIssueRaised,
  notifyIssueStatusChanged,
} from "./notifications";

import {
  chunkIds,
  grantScopes,
  grantWardIds,
  groupScopeQueries,
  hasGlobalScope,
  type ViewerGrant,
} from "@/lib/campaign-read-scope";
import type { CampaignScope } from "@/lib/campaign-scope";

import type { CampaignIssue, CampaignIssueStatus, ScopeType } from "@/types";

export type { CampaignIssue } from "@/types";

const COLLECTION = "issues";

/* ============================================================
 * MAPPING
 * ============================================================ */

/**
 * Fold the legacy six-state vocabulary into the three states the
 * campaign UI exposes. `assigned` / `in_progress` are still "open" work.
 */
function asStatus(value: unknown): CampaignIssueStatus {
  switch (String(value ?? "")) {
    case "acknowledged":
      return "acknowledged";
    case "resolved":
    case "closed":
      return "resolved";
    default:
      return "open";
  }
}

function mapIssue(id: string, data: Record<string, unknown>): CampaignIssue {
  const level = String(data.scope_level ?? data.scope_type ?? "lga");

  return {
    id,
    raised_by: String(data.raised_by ?? data.reported_by ?? ""),
    raised_at: data.raised_at ?? data.created_at,
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    scope_level: level as ScopeType,
    scope_id: String(data.scope_id ?? ""),
    status: asStatus(data.status),
    acknowledged_by:
      typeof data.acknowledged_by === "string" ? data.acknowledged_by : null,
    acknowledged_at: data.acknowledged_at ?? null,
    resolved_by: typeof data.resolved_by === "string" ? data.resolved_by : null,
    resolved_at: data.resolved_at ?? null,
    resolution_notes:
      typeof data.resolution_notes === "string" ? data.resolution_notes : null,
    issue_type: typeof data.issue_type === "string" ? data.issue_type : null,
    priority:
      (data.priority as CampaignIssue["priority"]) ?? "medium",
    location: typeof data.location === "string" ? data.location : null,
  };
}

function sortIssues(items: CampaignIssue[]): CampaignIssue[] {
  return [...items].sort((a, b) => {
    const left = a.raised_at ? String(a.raised_at) : "";
    const right = b.raised_at ? String(b.raised_at) : "";
    return right.localeCompare(left);
  });
}

function mergeInto(
  target: Map<string, CampaignIssue>,
  items: CampaignIssue[],
): void {
  for (const item of items) target.set(item.id, item);
}

/* ============================================================
 * READS
 * ============================================================ */

/** Issues the user raised. */
export async function getMyCampaignIssues(
  userId: string,
): Promise<CampaignIssue[]> {
  if (!userId) return [];

  const byId = new Map<string, CampaignIssue>();

  const raised = await campaignRead(
    { collection: COLLECTION, filter: { raised_by: userId } },
    () =>
      getDocs(query(collection(db, COLLECTION), where("raised_by", "==", userId))),
  );
  mergeInto(
    byId,
    raised.docs.map((item) => mapIssue(item.id, item.data())),
  );

  const legacy = await campaignRead(
    { collection: COLLECTION, filter: { reported_by: userId } },
    () =>
      getDocs(
        query(collection(db, COLLECTION), where("reported_by", "==", userId)),
      ),
  );
  mergeInto(
    byId,
    legacy.docs.map((item) => mapIssue(item.id, item.data())),
  );

  return sortIssues(Array.from(byId.values()));
}

/**
 * Issues the viewer may read, resolved from their GRANTS.
 *
 * Firestore proves a list read per query, so every query must name the
 * exact (scope_type, scope_id) pair the rules look up. The old version
 * walked the geographic hierarchy above the viewer's home area and
 * asked for each level: a PU coordinator's ward query is denied because
 * their `manage_issue` grant exists ONLY at the polling unit, and one
 * denied query fails the whole page.
 *
 * The query set is now `grantScopes(grants, ["manage_issue"])` — the
 * only permission any `issues` read clause consults that is scoped.
 * A plain member holds no `manage_issue` grant, so they issue no query
 * at all instead of one the rules would deny.
 */
export async function getIssuesInScope(
  scope: CampaignScope | null,
  grants: ViewerGrant[],
  options: { db?: Firestore } = {},
): Promise<CampaignIssue[]> {
  if (!scope) return [];

  const database = options.db ?? db;
  const byId = new Map<string, CampaignIssue>();

  const scopes = grantScopes(grants, ["manage_issue"]);

  /*
   * A GLOBAL `manage_issue` grant (a state coordinator) is the only
   * thing that makes an unfiltered list provable from `user_access`.
   *
   * A state-level scope is reached only by an admin or a state
   * coordinator: an admin's `isAdmin()` clause proves the same read, and
   * every lower authority resolves to a ward or a polling unit. Nothing
   * else can arrive here with `scope.level === "state"`.
   */
  if (
    hasGlobalScope(scopes) ||
    scope.level === "state" ||
    scope.level === "campaign"
  ) {
    const all = await campaignRead(
      { collection: COLLECTION, filter: { all: true } },
      () => getDocs(query(collection(database, COLLECTION))),
    );

    mergeInto(
      byId,
      all.docs.map((item) => mapIssue(item.id, item.data())),
    );

    return sortIssues(Array.from(byId.values()));
  }

  const { groups } = groupScopeQueries(scopes);

  for (const group of groups) {
    for (const ids of chunkIds(group.scope_ids)) {
      const snapshot = await campaignRead(
        {
          collection: COLLECTION,
          filter: { scope_type: group.scope_type, scope_id: ids },
        },
        () =>
          getDocs(
            query(
              collection(database, COLLECTION),
              where("scope_type", "==", group.scope_type),
              where("scope_id", "in", ids),
            ),
          ),
      );

      mergeInto(
        byId,
        snapshot.docs.map((item) => mapIssue(item.id, item.data())),
      );
    }
  }

  /*
   * Cascade UP: a PU-scoped issue is readable by the coordinator of its
   * ward, LGA, zone or state through the stamped `scope_ward_id`. Only
   * wards where the viewer actually holds `manage_issue` are queried,
   * and only inside the viewed scope — a viewer below ward level has no
   * ward grant and already covers their own PU exactly.
   */
  const scopeWards = new Set(scope.wardIds ?? []);

  const stampedWardIds = grantWardIds(grants, ["manage_issue"]).filter(
    (wardId) => scopeWards.has(wardId),
  );

  for (const ids of chunkIds(stampedWardIds)) {
    const stamped = await campaignRead(
      {
        collection: COLLECTION,
        filter: { scope_ward_id: ids },
      },
      () =>
        getDocs(
          query(
            collection(database, COLLECTION),
            where("scope_ward_id", "in", ids),
          ),
        ),
    );

    mergeInto(
      byId,
      stamped.docs.map((item) => mapIssue(item.id, item.data())),
    );
  }

  return sortIssues(Array.from(byId.values()));
}

/* ============================================================
 * WRITES
 * ============================================================ */

export interface RaiseIssueInput {
  raised_by: string;
  title: string;
  description: string;

  scope_level: ScopeType;
  scope_id: string;

  /** Ward the issue belongs to, for scoped reads. */
  scope_ward_id?: string | null;

  issue_type?: string | null;
  priority?: CampaignIssue["priority"];
  location?: string | null;
}

export async function raiseCampaignIssue(
  input: RaiseIssueInput,
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    title: input.title.trim(),
    description: input.description.trim(),

    issue_type: input.issue_type ?? "other",
    priority: input.priority ?? "medium",

    status: "reported",

    raised_by: input.raised_by,
    raised_at: serverTimestamp(),

    scope_level: input.scope_level,
    scope_id: input.scope_id,
    scope_ward_id: input.scope_ward_id ?? null,

    /* Legacy names the rules read. */
    reported_by: input.raised_by,
    scope_type: input.scope_level,

    location: input.location?.trim() || null,

    assigned_to: null,
    evidence_url: null,
    resolution_notes: null,

    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  /* Admins are the audience a member's report can reliably reach. */
  try {
    await notifyIssueRaised({
      issueId: ref.id,
      title: input.title.trim(),
      actorId: input.raised_by,
    });
  } catch (error) {
    console.error("Failed to notify the administrators:", error);
  }

  return ref.id;
}

/**
 * Tell the member who raised an issue that its state changed.
 *
 * Best-effort: the status write has already committed, and a failed
 * notification must not undo it.
 */
async function notifyIssueOwner(
  issueId: string,
  status: string,
  actorId: string,
): Promise<void> {
  try {
    const snapshot = await getDoc(doc(db, COLLECTION, issueId));
    if (!snapshot.exists()) return;

    const data = snapshot.data();

    await notifyIssueStatusChanged({
      issueId,
      title: String(data.title ?? "Campaign issue"),
      raisedBy: String(data.raised_by ?? data.reported_by ?? ""),
      status,
      actorId,
    });
  } catch (error) {
    console.error("Failed to notify the member who raised the issue:", error);
  }
}

/**
 * Acknowledge an issue. Any coordinator covering the issue may do this,
 * as may admin (the rules allow both).
 */
export async function acknowledgeCampaignIssue(
  issueId: string,
  userId: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, issueId), {
    status: "acknowledged",
    acknowledged_by: userId,
    acknowledged_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  await notifyIssueOwner(issueId, "acknowledged", userId);
}

/**
 * Resolve an issue with optional notes.
 */
export async function resolveCampaignIssue(input: {
  issueId: string;
  userId: string;
  notes?: string | null;
}): Promise<void> {
  await updateDoc(doc(db, COLLECTION, input.issueId), {
    status: "resolved",
    resolved_by: input.userId,
    resolved_at: serverTimestamp(),
    resolution_notes: input.notes?.trim() || null,
    updated_at: serverTimestamp(),
  });

  await notifyIssueOwner(input.issueId, "resolved", input.userId);
}
