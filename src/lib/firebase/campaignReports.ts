"use client";

/*
 * ============================================================
 * CAMPAIGN REPORTS
 * ============================================================
 *
 * A report is a submission against an assignment.
 *
 * Visibility is deliberately NARROW and does not cascade up:
 *
 *   submitter .............. always
 *   assignment creator ..... always
 *   admin .................. always
 *
 * An LGA coordinator does NOT see a ward coordinator's report to PU
 * members. This is the one collection where "higher up" means nothing.
 *
 * The document lives in `campaign_field_reports` (the collection the
 * rules and both report pages already use). Round 5 adds:
 *
 *   assignment_id, assignment_creator_id, scope_snapshot,
 *   reviewed_at, review_notes
 *
 * and folds the legacy `accepted` / `returned` statuses into
 * `approved` / `rejected`.
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

import type { CampaignReport, ScopeType } from "@/types";

export type { CampaignReport } from "@/types";

const COLLECTION = "campaign_field_reports";
const IN_FILTER_LIMIT = 30;

/* ============================================================
 * MAPPING
 * ============================================================ */

function asStatus(value: unknown): CampaignReport["status"] {
  switch (String(value ?? "")) {
    case "approved":
    case "accepted":
      return "approved";
    case "rejected":
    case "returned":
      return "rejected";
    default:
      return "submitted";
  }
}

function mapReport(
  id: string,
  data: Record<string, unknown>,
): CampaignReport {
  const scopeLevel = String(data.scope_level ?? data.scope_type ?? "lga");
  const scopeId = String(data.scope_id ?? "");

  const snapshot =
    data.scope_snapshot && typeof data.scope_snapshot === "object"
      ? (data.scope_snapshot as CampaignReport["scope_snapshot"])
      : null;

  return {
    id,
    assignment_id: String(data.assignment_id ?? ""),
    assignment_creator_id: String(data.assignment_creator_id ?? ""),
    submitted_by: String(data.submitted_by ?? ""),
    submitted_at: data.submitted_at ?? data.created_at,
    title: String(data.title ?? ""),
    content: String(data.content ?? data.description ?? ""),
    status: asStatus(data.status),
    reviewed_by:
      typeof data.reviewed_by === "string" ? data.reviewed_by : null,
    reviewed_at: data.reviewed_at ?? null,
    review_notes:
      typeof data.review_notes === "string"
        ? data.review_notes
        : typeof data.review_comment === "string"
          ? data.review_comment
          : null,
    scope_level: scopeLevel as ScopeType,
    scope_id: scopeId,
    scope_snapshot: snapshot,
  };
}

function sortReports(items: CampaignReport[]): CampaignReport[] {
  return [...items].sort((a, b) => {
    const left = a.submitted_at ? String(a.submitted_at) : "";
    const right = b.submitted_at ? String(b.submitted_at) : "";
    return right.localeCompare(left);
  });
}

/* ============================================================
 * READS
 * ============================================================ */

/** Reports the user submitted. */
export async function getMyCampaignReports(
  userId: string,
): Promise<CampaignReport[]> {
  if (!userId) return [];

  const snapshot = await campaignRead(
    { collection: COLLECTION, filter: { submitted_by: userId } },
    () =>
      getDocs(
        query(collection(db, COLLECTION), where("submitted_by", "==", userId)),
      ),
  );

  return sortReports(
    snapshot.docs.map((item) => mapReport(item.id, item.data())),
  );
}

/**
 * Reports against assignments the user created.
 *
 * This is the "Reports Received" list — the only way a coordinator
 * legitimately sees someone else's report.
 */
export async function getReportsReceived(
  creatorId: string,
): Promise<CampaignReport[]> {
  if (!creatorId) return [];

  const snapshot = await campaignRead(
    { collection: COLLECTION, filter: { assignment_creator_id: creatorId } },
    () =>
      getDocs(
        query(
          collection(db, COLLECTION),
          where("assignment_creator_id", "==", creatorId),
        ),
      ),
  );

  return sortReports(
    snapshot.docs.map((item) => mapReport(item.id, item.data())),
  );
}

/*
 * `getReportsForAssignment()` used to live here. It filtered only on
 * `assignment_id`, which no rule reads, so Firestore could not prove a
 * single document and the read was denied for every non-admin — and it
 * had no callers. Removed rather than kept as a trap. Use
 * `getMyCampaignReports()` + `getReportsReceived()`, which filter on
 * the two fields the rules do read.
 */

/**
 * Admin view: every report, optionally narrowed to a scope and below.
 *
 * Admin-only by design: the unfiltered list is provable only through
 * the `isAdmin()` clause. Filtering happens in memory because the
 * stored scope is a snapshot (a ward-scoped report from a PU member
 * must still be visible when the admin filters to the ward).
 */
export async function getAllCampaignReports(filter?: {
  level?: ScopeType | null;
  wardIds?: string[];
  pollingUnitIds?: string[];
}): Promise<CampaignReport[]> {
  const snapshot = await campaignRead(
    { collection: COLLECTION, filter: { all: true } },
    () => getDocs(query(collection(db, COLLECTION))),
  );

  const all = sortReports(
    snapshot.docs.map((item) => mapReport(item.id, item.data())),
  );

  if (!filter?.level) return all;

  if (filter.level === "state" || filter.level === "campaign") return all;

  const wardIds = new Set(filter.wardIds ?? []);
  const puIds = new Set(filter.pollingUnitIds ?? []);

  return all.filter((report) => {
    const snapshotWard = report.scope_snapshot?.ward_id ?? "";
    const snapshotPu = report.scope_snapshot?.polling_unit_id ?? "";

    if (snapshotPu && puIds.has(snapshotPu)) return true;
    if (snapshotWard && wardIds.has(snapshotWard)) return true;

    return false;
  });
}

/* ============================================================
 * WRITES
 * ============================================================ */

export interface SubmitReportInput {
  assignment_id: string;
  assignment_creator_id: string;

  submitted_by: string;

  title: string;
  content: string;

  scope_level: ScopeType;
  scope_id: string;

  scope_snapshot?: CampaignReport["scope_snapshot"];
}

/**
 * Submit a report against an assignment.
 *
 * The reporter's scope is snapshotted at submission time so an admin
 * can filter by geography later without re-resolving the member.
 */
export async function submitCampaignReport(
  input: SubmitReportInput,
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    assignment_id: input.assignment_id,
    assignment_creator_id: input.assignment_creator_id,

    submitted_by: input.submitted_by,
    submitted_at: serverTimestamp(),

    title: input.title.trim(),
    content: input.content.trim(),
    description: input.content.trim(),

    status: "submitted",

    scope_level: input.scope_level,
    scope_id: input.scope_id,

    /* Legacy field names the rules and old readers still use. */
    scope_type: input.scope_level,

    scope_snapshot: input.scope_snapshot ?? null,

    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
    review_comment: null,

    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  return ref.id;
}

/**
 * Creator (or admin) decision on a report.
 */
export async function reviewCampaignReport(input: {
  reportId: string;
  status: "approved" | "rejected";
  reviewedBy: string;
  notes?: string | null;
}): Promise<void> {
  await updateDoc(doc(db, COLLECTION, input.reportId), {
    status: input.status,
    reviewed_by: input.reviewedBy,
    reviewed_at: serverTimestamp(),
    review_notes: input.notes?.trim() || null,
    review_comment: input.notes?.trim() || null,
    updated_at: serverTimestamp(),
  });
}
