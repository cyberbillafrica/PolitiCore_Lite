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

import type { OrganizationalAssignment, ScopeType } from "@/types";

/*
 * ============================================================
 * CAMPAIGN ISSUE
 * ============================================================
 */

export type CampaignIssueType =
  | "logistics"
  | "campaign_activity"
  | "community_concern"
  | "volunteer"
  | "communication"
  | "security"
  | "infrastructure"
  | "other";

export type CampaignIssuePriority = "low" | "medium" | "high" | "urgent";

export type CampaignIssueStatus =
  | "reported"
  | "acknowledged"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

export interface CampaignIssue {
  id: string;

  tenant_id?: string;

  title: string;
  description: string;

  issue_type: CampaignIssueType;
  priority: CampaignIssuePriority;
  status: CampaignIssueStatus;

  scope_type: ScopeType;
  scope_id: string;

  reported_by: string;

  assigned_to?: string | null;

  location?: string | null;

  evidence_url?: string | null;

  resolution_notes?: string | null;

  created_at?: unknown;
  updated_at?: unknown;
}

/*
 * ============================================================
 * CREATE ISSUE
 * ============================================================
 */

export async function createCampaignIssue(data: {
  title: string;
  description: string;
  issue_type: CampaignIssueType;
  priority: CampaignIssuePriority;

  scope_type: ScopeType;
  scope_id: string;

  reported_by: string;

  location?: string;
  evidence_url?: string;
  tenant_id?: string;
}) {
  const ref = await addDoc(collection(db, "issues"), {
    title: data.title.trim(),
    description: data.description.trim(),

    issue_type: data.issue_type,
    priority: data.priority,

    status: "reported",

    scope_type: data.scope_type,
    scope_id: data.scope_id,

    reported_by: data.reported_by,

    location: data.location?.trim() || null,
    evidence_url: data.evidence_url?.trim() || null,

    tenant_id: data.tenant_id ?? null,

    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  return ref.id;
}

/*
 * ============================================================
 * GET ISSUES FOR AN ORGANIZATIONAL SCOPE
 * ============================================================
 *
 * The page passes the user's active organizational assignment.
 *
 * For the current application we query the exact assigned scope.
 *
 * Hierarchical expansion remains deliberately outside this
 * function until the electoral hierarchy resolver is wired in.
 * ============================================================
 */

export async function getScopedCampaignIssues(
  assignment: OrganizationalAssignment,
): Promise<CampaignIssue[]> {
  const q = assignment.tenant_id
    ? query(
        collection(db, "issues"),
        where("tenant_id", "==", assignment.tenant_id),
        where("scope_type", "==", assignment.scope_type),
        where("scope_id", "==", assignment.scope_id),
        orderBy("created_at", "desc"),
      )
    : query(
        collection(db, "issues"),
        where("scope_type", "==", assignment.scope_type),
        where("scope_id", "==", assignment.scope_id),
        orderBy("created_at", "desc"),
      );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  })) as CampaignIssue[];
}

/*
 * ============================================================
 * GET MY REPORTED ISSUES
 * ============================================================
 */

export async function getMyCampaignIssues(
  userId: string,
): Promise<CampaignIssue[]> {
  const q = query(
    collection(db, "issues"),
    where("reported_by", "==", userId),
    orderBy("created_at", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  })) as CampaignIssue[];
}

