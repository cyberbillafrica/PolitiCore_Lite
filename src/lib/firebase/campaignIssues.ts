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
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "./config";
import { campaignRead } from "./query-debug";

import { chunkIds } from "@/lib/campaign-read-scope";
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
 * Issues at or below a scope — the coordinator's cascade-up view.
 *
 * Three queries cover the whole hierarchy:
 *   1. issues whose own scope is exactly the viewer's scope
 *   2. issues in the wards the viewer covers (ward-scoped rows)
 *   3. issues stamped with one of those wards (PU-scoped rows)
 */
export async function getIssuesInScope(
  scope: CampaignScope | null,
): Promise<CampaignIssue[]> {
  if (!scope) return [];

  const byId = new Map<string, CampaignIssue>();

  /*
   * A state-scoped viewer holds a GLOBAL `manage_issue` grant, which is
   * the only thing that makes an unfiltered list provable. Anyone else
   * must come through the scoped queries below.
   */
  if (scope.level === "state" || scope.level === "campaign") {
    const all = await campaignRead(
      { collection: COLLECTION, filter: { all: true } },
      () => getDocs(query(collection(db, COLLECTION))),
    );
    mergeInto(
      byId,
      all.docs.map((item) => mapIssue(item.id, item.data())),
    );
    return sortIssues(Array.from(byId.values()));
  }

  /* 1. Exact-level rows (covers legacy documents with no ward stamp). */
  const exact = await campaignRead(
    {
      collection: COLLECTION,
      filter: { scope_type: scope.level, scope_id: scope.scope_id },
    },
    () =>
      getDocs(
        query(
          collection(db, COLLECTION),
          where("scope_type", "==", scope.level),
          where("scope_id", "==", scope.scope_id),
        ),
      ),
  );
  mergeInto(
    byId,
    exact.docs.map((item) => mapIssue(item.id, item.data())),
  );

  for (const chunk of chunkIds(scope.wardIds)) {
    /* 2. Ward-scoped rows inside the scope. */
    const wards = await campaignRead(
      { collection: COLLECTION, filter: { scope_type: "ward", scope_id: chunk } },
      () =>
        getDocs(
          query(
            collection(db, COLLECTION),
            where("scope_type", "==", "ward"),
            where("scope_id", "in", chunk),
          ),
        ),
    );
    mergeInto(
      byId,
      wards.docs.map((item) => mapIssue(item.id, item.data())),
    );

    /* 3. Anything stamped to one of those wards (PU-scoped rows). */
    const stamped = await campaignRead(
      { collection: COLLECTION, filter: { scope_ward_id: chunk } },
      () =>
        getDocs(
          query(collection(db, COLLECTION), where("scope_ward_id", "in", chunk)),
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

  return ref.id;
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
}
