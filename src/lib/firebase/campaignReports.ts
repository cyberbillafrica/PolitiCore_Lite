"use client";

import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "./config";

export type CampaignReportStatus =
  | "submitted"
  | "under_review"
  | "accepted"
  | "returned";

export type CampaignReportType =
  | "activity"
  | "community"
  | "mobilization"
  | "meeting"
  | "field"
  | "other";

export interface CampaignFieldReport {
  id: string;

  tenant_id: string;

  submitted_by: string;

  report_type: CampaignReportType;

  title: string;
  description: string;

  scope_type: string;
  scope_id: string;

  location?: string | null;

  participants?: number | null;

  issues?: string | null;

  community_feedback?: string | null;

  requests?: string | null;

  follow_up_required?: boolean;

  evidence_url?: string | null;

  status: CampaignReportStatus;

  reviewed_by?: string | null;
  review_comment?: string | null;

  created_at?: unknown;
  updated_at?: unknown;
}

/*
 * ============================================================
 * COLLECTION
 * ============================================================
 */

const COLLECTION = "campaign_field_reports";

/*
 * ============================================================
 * MAP DOCUMENT
 * ============================================================
 */

function mapReport(
  id: string,
  data: Record<string, unknown>,
): CampaignFieldReport {
  return {
    id,

    tenant_id: String(data.tenant_id ?? ""),

    submitted_by: String(data.submitted_by ?? ""),

    report_type: (data.report_type as CampaignReportType) ?? "field",

    title: String(data.title ?? ""),

    description: String(data.description ?? ""),

    scope_type: String(data.scope_type ?? ""),
    scope_id: String(data.scope_id ?? ""),

    location: typeof data.location === "string" ? data.location : null,

    participants:
      typeof data.participants === "number" ? data.participants : null,

    issues: typeof data.issues === "string" ? data.issues : null,

    community_feedback:
      typeof data.community_feedback === "string"
        ? data.community_feedback
        : null,

    requests: typeof data.requests === "string" ? data.requests : null,

    follow_up_required: data.follow_up_required === true,

    evidence_url:
      typeof data.evidence_url === "string" ? data.evidence_url : null,

    status: (data.status as CampaignReportStatus) ?? "submitted",

    reviewed_by: typeof data.reviewed_by === "string" ? data.reviewed_by : null,

    review_comment:
      typeof data.review_comment === "string" ? data.review_comment : null,

    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/*
 * ============================================================
 * MY REPORTS
 * ============================================================
 */

export async function getMyCampaignReports(
  userId: string,
): Promise<CampaignFieldReport[]> {
  if (!userId) {
    return [];
  }

  const q = query(
    collection(db, COLLECTION),
    where("submitted_by", "==", userId),
    orderBy("created_at", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((item) => mapReport(item.id, item.data()));
}

/*
 * ============================================================
 * SCOPED REPORTS
 * ============================================================
 *
 * Coordinators can request reports belonging to their
 * organizational scope.
 */

export async function getScopedCampaignReports(
  tenantId: string,
  scopeType: string,
  scopeId: string,
): Promise<CampaignFieldReport[]> {
  if (!tenantId || !scopeType || !scopeId) {
    return [];
  }

  const q = query(
    collection(db, COLLECTION),
    where("tenant_id", "==", tenantId),
    where("scope_type", "==", scopeType),
    where("scope_id", "==", scopeId),
    orderBy("created_at", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((item) => mapReport(item.id, item.data()));
}

/*
 * ============================================================
 * CREATE REPORT
 * ============================================================
 */

export async function createCampaignFieldReport(data: {
  tenant_id: string;

  submitted_by: string;

  report_type: CampaignReportType;

  title: string;
  description: string;

  scope_type: string;
  scope_id: string;

  location?: string | null;

  participants?: number | null;

  issues?: string | null;

  community_feedback?: string | null;

  requests?: string | null;

  follow_up_required?: boolean;

  evidence_url?: string | null;
}) {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,

    status: "submitted",

    reviewed_by: null,
    review_comment: null,

    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  return ref.id;
}

