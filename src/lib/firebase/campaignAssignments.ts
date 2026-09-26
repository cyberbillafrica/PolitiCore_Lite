"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  type Query,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase/config";
import { CURRENT_TENANT_ID } from "@/lib/firebase/tenants";

/*
 * ============================================================
 * CAMPAIGN ASSIGNMENT
 * ============================================================
 */

export interface CampaignAssignment {
  id: string;

  tenant_id: string;

  title: string;
  description?: string;

  assigned_to: string;
  assigned_by: string;

  scope_type: string;
  scope_id: string;

  priority: "low" | "medium" | "high" | "urgent";

  status:
    | "not_started"
    | "in_progress"
    | "submitted"
    | "under_review"
    | "completed"
    | "overdue";

  due_date?: string | null;

  location?: string | null;

  evidence_url?: string | null;

  created_at?: unknown;
  updated_at?: unknown;
}

/*
 * ============================================================
 * COLLECTION
 * ============================================================
 */

const COLLECTION = "campaign_assignments";

/*
 * ============================================================
 * MAP FIRESTORE DOCUMENT
 * ============================================================
 */

function mapAssignment(
  id: string,
  data: Record<string, unknown>,
): CampaignAssignment {
  return {
    id,

    tenant_id: String(data.tenant_id ?? ""),

    title: String(data.title ?? ""),
    description:
      typeof data.description === "string" ? data.description : undefined,

    assigned_to: String(data.assigned_to ?? ""),
    assigned_by: String(data.assigned_by ?? ""),

    scope_type: String(data.scope_type ?? ""),
    scope_id: String(data.scope_id ?? ""),

    priority: (data.priority as CampaignAssignment["priority"]) ?? "medium",

    status: (data.status as CampaignAssignment["status"]) ?? "not_started",

    due_date: typeof data.due_date === "string" ? data.due_date : null,

    location: typeof data.location === "string" ? data.location : null,

    evidence_url:
      typeof data.evidence_url === "string" ? data.evidence_url : null,

    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/*
 * ============================================================
 * GET MY ASSIGNMENTS
 * ============================================================
 *
 * This is the safe first implementation:
 *
 * A normal campaign member can see assignments actually
 * assigned to them.
 *
 * Coordinators/admin expansion will use organizational scope
 * as we strengthen the Firestore authorization layer.
 */

export async function getAllCampaignAssignments(
  tenantId?: string,
): Promise<CampaignAssignment[]> {
  const targetTenantId = tenantId || CURRENT_TENANT_ID;

  const q = query(
    collection(db, COLLECTION),
    where("tenant_id", "==", targetTenantId),
    orderBy("created_at", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((item) => mapAssignment(item.id, item.data()));
}

export async function getMyCampaignAssignments(
  userId: string,
  userEmail?: string,
): Promise<CampaignAssignment[]> {
  if (!userId && !userEmail) {
    return [];
  }

  const seen = new Set<string>();
  const results: CampaignAssignment[] = [];

  const queries: Query[] = [];

  if (userId) {
    queries.push(
      query(
        collection(db, COLLECTION),
        where("assigned_to", "==", userId),
        orderBy("created_at", "desc"),
      ),
    );
  }

  if (userEmail) {
    queries.push(
      query(
        collection(db, COLLECTION),
        where("assigned_to", "==", userEmail),
        orderBy("created_at", "desc"),
      ),
    );
  }

  for (const q of queries) {
    const snapshot = await getDocs(q);

    for (const docSnapshot of snapshot.docs) {
      const assignment = mapAssignment(docSnapshot.id, docSnapshot.data());

      if (!seen.has(assignment.id)) {
        seen.add(assignment.id);
        results.push(assignment);
      }
    }
  }

  return results.sort((a, b) => {
    const aDate = a.created_at ? new Date(String(a.created_at)).getTime() : 0;
    const bDate = b.created_at ? new Date(String(b.created_at)).getTime() : 0;
    return bDate - aDate;
  });
}

/*
 * ============================================================
 * GET AREA ASSIGNMENTS
 * ============================================================
 *
 * Used by authorized coordinators.
 *
 * The page supplies the coordinator's organizational scope.
 */

export async function getScopedCampaignAssignments(
  tenantIdOrScopeType: string,
  scopeTypeOrId: string,
  scopeIdParam?: string,
): Promise<CampaignAssignment[]> {
  const scopeType = scopeIdParam ? scopeTypeOrId : tenantIdOrScopeType;
  const scopeId = scopeIdParam ? scopeIdParam : scopeTypeOrId;
  const targetTenantId = scopeIdParam ? tenantIdOrScopeType : CURRENT_TENANT_ID;

  if (!scopeType || !scopeId) {
    return [];
  }

  const q = query(
    collection(db, COLLECTION),
    where("tenant_id", "==", targetTenantId),
    where("scope_type", "==", scopeType),
    where("scope_id", "==", scopeId),
    orderBy("created_at", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((item) => mapAssignment(item.id, item.data()));
}

/*
 * ============================================================
 * CREATE ASSIGNMENT
 * ============================================================
 */

export async function createCampaignAssignment(data: {
  tenant_id: string;

  title: string;
  description?: string;

  assigned_to: string;
  assigned_by: string;

  scope_type: string;
  scope_id: string;

  priority?: CampaignAssignment["priority"];

  due_date?: string | null;

  location?: string | null;
}) {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,

    priority: data.priority ?? "medium",

    status: "not_started",

    evidence_url: null,

    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  return ref.id;
}

export async function updateCampaignAssignment(
  assignmentId: string,
  data: Partial<{
    title: string;
    description?: string;
    assigned_to: string;
    assigned_by: string;
    scope_type: string;
    scope_id: string;
    priority: CampaignAssignment["priority"];
    status: CampaignAssignment["status"];
    due_date: string | null;
    location: string | null;
  }>,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, assignmentId), {
    ...data,
    updated_at: serverTimestamp(),
  });
}

export async function deleteCampaignAssignment(
  assignmentId: string,
): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, assignmentId));
}

