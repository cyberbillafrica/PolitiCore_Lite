"use client";

/*
 * ============================================================
 * CAMPAIGN ACTIVITIES
 * ============================================================
 *
 * An activity is created at a scope and is visible to that scope and
 * everything below it:
 *
 *   state activity  -> everyone
 *   zone activity   -> every member of the zone's LGAs
 *   LGA activity    -> every member of the LGA's wards
 *   ward activity   -> every member of the ward and its polling units
 *   PU activity     -> that polling unit's members
 *
 * To make that one query instead of hundreds, every activity carries:
 *
 *   scope_chain             every ancestor id from state down to its
 *                           own scope (["enugu-state", "nkanu-west", ...])
 *   visibility_ward_ids     the wards it is visible in
 *   visibility_pu_ids       the polling units (PU-scoped rows only)
 *
 * A member then asks for `scope_chain array-contains <one of their
 * ancestor ids>`, which is ~5 queries per page instead of one per
 * polling unit.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "./config";
import {
  resolveCampaignScope,
  zoneIdForLga,
  type CampaignScope,
} from "@/lib/campaign-scope";

import type {
  CampaignActivity,
  CampaignActivityStatus,
  CampaignActivityType,
  LGA,
  ScopeType,
} from "@/types";

export interface CampaignActivityRecord extends CampaignActivity {
  scope_chain?: string[];
  visibility_ward_ids?: string[];
  visibility_pu_ids?: string[];
  created_by?: string;
}

export interface CreateCampaignActivityInput {
  title: string;
  description?: string;

  activity_type: CampaignActivityType;
  status?: CampaignActivityStatus;

  date: string;
  start_time?: string;
  end_time?: string;

  venue?: string;

  scope_type: ScopeType;
  scope_id: string;

  /** The authenticated user creating the activity. */
  created_by: string;

  organizer_id: string;
  organizer_name?: string;

  expected_attendance?: number;
}

/* ============================================================
 * MAPPING
 * ============================================================ */

function mapActivity(
  id: string,
  data: Record<string, unknown>,
): CampaignActivityRecord {
  return {
    id,
    title: String(data.title ?? ""),
    description:
      typeof data.description === "string" ? data.description : undefined,
    activity_type: (data.activity_type as CampaignActivityType) ?? "meeting",
    status: (data.status as CampaignActivityStatus) ?? "scheduled",
    date: String(data.date ?? ""),
    start_time: typeof data.start_time === "string" ? data.start_time : undefined,
    end_time: typeof data.end_time === "string" ? data.end_time : undefined,
    venue: typeof data.venue === "string" ? data.venue : undefined,
    scope_type: String(data.scope_type ?? "state") as ScopeType,
    scope_id: String(data.scope_id ?? ""),
    organizer_id: String(data.organizer_id ?? ""),
    organizer_name:
      typeof data.organizer_name === "string" ? data.organizer_name : undefined,
    expected_attendance:
      typeof data.expected_attendance === "number"
        ? data.expected_attendance
        : undefined,
    created_at: data.created_at,
    updated_at: data.updated_at,
    created_by: typeof data.created_by === "string" ? data.created_by : undefined,
    scope_chain: Array.isArray(data.scope_chain)
      ? (data.scope_chain as string[])
      : undefined,
    visibility_ward_ids: Array.isArray(data.visibility_ward_ids)
      ? (data.visibility_ward_ids as string[])
      : undefined,
    visibility_pu_ids: Array.isArray(data.visibility_pu_ids)
      ? (data.visibility_pu_ids as string[])
      : undefined,
  };
}

function sortActivities(
  items: CampaignActivityRecord[],
): CampaignActivityRecord[] {
  return [...items].sort((a, b) => {
    const left = `${a.date} ${a.start_time ?? ""}`;
    const right = `${b.date} ${b.start_time ?? ""}`;
    return left.localeCompare(right);
  });
}

/* ============================================================
 * VISIBILITY STAMPS
 * ============================================================ */

export interface ActivityVisibility {
  scope_chain: string[];
  visibility_ward_ids: string[];
  visibility_pu_ids: string[];
}

/**
 * Translate a scope into the stamps that make reads cheap.
 *
 * The chain always starts at the state so `array-contains` on a single
 * ancestor id resolves "at or above me"; the ward/PU arrays make
 * "at or below me" resolvable the same way.
 */
export async function buildActivityVisibility(
  level: ScopeType,
  scopeId: string,
  lgas?: LGA[],
): Promise<ActivityVisibility> {
  const resolved = await resolveCampaignScope(level, scopeId, lgas);

  if (!resolved) {
    return { scope_chain: [], visibility_ward_ids: [], visibility_pu_ids: [] };
  }

  const chain: string[] = ["enugu-state"];

  if (level === "senatorial_zone") chain.push(scopeId);
  if (level === "lga") {
    chain.push(scopeId);
  }
  if (level === "ward" || level === "polling_unit") {
    const lgaId = resolved.lgaIds[0];
    const zoneId = zoneIdForLga(lgaId);
    if (zoneId) chain.push(zoneId);
    if (lgaId) chain.push(lgaId);
    if (level === "ward") chain.push(scopeId);
    if (level === "polling_unit") {
      const wardId = resolved.wardIds[0];
      if (wardId && wardId !== scopeId) chain.push(wardId);
      chain.push(scopeId);
    }
  }

  return {
    scope_chain: Array.from(new Set(chain)),
    visibility_ward_ids: resolved.wardIds,
    visibility_pu_ids:
      level === "polling_unit" ? [resolved.scope_id] : [],
  };
}

/* ============================================================
 * READS
 * ============================================================ */

/** Every activity. Admin only (rules also gate this). */
export async function getAllCampaignActivities(): Promise<
  CampaignActivityRecord[]
> {
  const snapshot = await getDocs(query(collection(db, "campaign_activities")));

  return sortActivities(
    snapshot.docs.map((item) => mapActivity(item.id, item.data())),
  );
}

/**
 * Activities visible to a scope: the scope itself, everything above it
 * (state -> zone -> LGA -> ward), and everything below it.
 */
export async function getActivitiesInScope(
  scope: CampaignScope | null,
): Promise<CampaignActivityRecord[]> {
  if (!scope) return [];

  if (scope.level === "state" || scope.level === "campaign") {
    return getAllCampaignActivities();
  }

  const byId = new Map<string, CampaignActivityRecord>();

  /* The chain ids of my own location, nearest first. */
  const chain = await buildActivityVisibility(scope.level, scope.scope_id);

  /*
   * One query per chain id covers "at or below me" (my own id) and
   * "above me" (ancestors). A state-scoped activity carries only
   * "enugu-state", which every chain includes.
   */
  for (const chainId of chain.scope_chain) {
    const snapshot = await getDocs(
      query(
        collection(db, "campaign_activities"),
        where("scope_chain", "array-contains", chainId),
      ),
    );

    for (const document of snapshot.docs) {
      byId.set(document.id, mapActivity(document.id, document.data()));
    }
  }

  /*
   * Legacy rows written before the chain existed: fall back to exact
   * scope matches so an older activity still appears for its own scope.
   */
  const exact = await getDocs(
    query(
      collection(db, "campaign_activities"),
      where("scope_type", "==", scope.level),
      where("scope_id", "==", scope.scope_id),
    ),
  );

  for (const document of exact.docs) {
    byId.set(document.id, mapActivity(document.id, document.data()));
  }

  return sortActivities(Array.from(byId.values()));
}

/**
 * Admin filter: activities at the selected scope or below.
 */
export async function getActivitiesForAdminScope(
  level: ScopeType | null,
  scopeId: string | null,
): Promise<CampaignActivityRecord[]> {
  if (!level || !scopeId) return getAllCampaignActivities();

  if (level === "state" || level === "campaign") {
    return getAllCampaignActivities();
  }

  const byId = new Map<string, CampaignActivityRecord>();

  const snapshot = await getDocs(
    query(
      collection(db, "campaign_activities"),
      where("scope_chain", "array-contains", scopeId),
    ),
  );

  for (const document of snapshot.docs) {
    byId.set(document.id, mapActivity(document.id, document.data()));
  }

  /* State-wide activities stay visible under every filter. */
  const stateWide = await getDocs(
    query(
      collection(db, "campaign_activities"),
      where("scope_type", "==", "state"),
    ),
  );

  for (const document of stateWide.docs) {
    byId.set(document.id, mapActivity(document.id, document.data()));
  }

  return sortActivities(Array.from(byId.values()));
}

/* ============================================================
 * WRITES
 * ============================================================ */

export async function updateCampaignActivity(
  activityId: string,
  input: Partial<CreateCampaignActivityInput>,
): Promise<void> {
  const updates: Record<string, unknown> = {
    updated_at: serverTimestamp(),
  };

  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.activity_type !== undefined)
    updates.activity_type = input.activity_type;
  if (input.status !== undefined) updates.status = input.status;
  if (input.date !== undefined) updates.date = input.date;
  if (input.start_time !== undefined) updates.start_time = input.start_time;
  if (input.end_time !== undefined) updates.end_time = input.end_time;
  if (input.venue !== undefined) updates.venue = input.venue;
  if (input.organizer_id !== undefined)
    updates.organizer_id = input.organizer_id;
  if (input.organizer_name !== undefined)
    updates.organizer_name = input.organizer_name;
  if (input.expected_attendance !== undefined)
    updates.expected_attendance = input.expected_attendance;

  await updateDoc(doc(db, "campaign_activities", activityId), updates);
}

export async function deleteCampaignActivity(
  activityId: string,
): Promise<void> {
  await deleteDoc(doc(db, "campaign_activities", activityId));
}

export async function createCampaignActivity(
  input: CreateCampaignActivityInput,
): Promise<string> {
  const visibility = await buildActivityVisibility(
    input.scope_type,
    input.scope_id,
  );

  const activityData: Record<string, unknown> = {
    title: input.title,
    activity_type: input.activity_type,
    date: input.date,

    scope_type: input.scope_type,
    scope_id: input.scope_id,

    created_by: input.created_by,
    organizer_id: input.organizer_id,

    status: input.status ?? "scheduled",

    scope_chain: visibility.scope_chain,
    visibility_ward_ids: visibility.visibility_ward_ids,
    visibility_pu_ids: visibility.visibility_pu_ids,

    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };

  if (input.description !== undefined) {
    activityData.description = input.description;
  }
  if (input.start_time !== undefined) {
    activityData.start_time = input.start_time;
  }
  if (input.end_time !== undefined) {
    activityData.end_time = input.end_time;
  }
  if (input.venue !== undefined) {
    activityData.venue = input.venue;
  }
  if (input.organizer_name !== undefined) {
    activityData.organizer_name = input.organizer_name;
  }
  if (input.expected_attendance !== undefined) {
    activityData.expected_attendance = input.expected_attendance;
  }

  const ref = await addDoc(collection(db, "campaign_activities"), activityData);

  return ref.id;
}
