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
  type Firestore,
} from "firebase/firestore";

import { db } from "./config";
import { campaignRead } from "./query-debug";
import {
  resolveCampaignScope,
  zoneIdForLga,
  type CampaignScope,
} from "@/lib/campaign-scope";
import {
  activityWardIds,
  chunkIds,
  grantScopes,
  grantWardIds,
  groupScopeQueries,
  hasGlobalScope,
  type ViewerGrant,
} from "@/lib/campaign-read-scope";

import type {
  CampaignActivity,
  CampaignActivityStatus,
  CampaignActivityType,
  LGA,
  ScopeType,
} from "@/types";

export interface CampaignActivityRecord extends CampaignActivity {
  scope_chain?: string[];
  scope_ward_id?: string;
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
    scope_ward_id:
      typeof data.scope_ward_id === "string" ? data.scope_ward_id : undefined,
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
  /**
   * The ward a PU-scoped row belongs to. Stamped so a coordinator can
   * read the PU activity with ONE ward-stamped query (firestore.rules
   * reads this field); null for ward and above, which are already
   * addressable by their own scope pair.
   */
  scope_ward_id: string | null;
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
    return {
      scope_chain: [],
      scope_ward_id: null,
      visibility_ward_ids: [],
      visibility_pu_ids: [],
    };
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

  const scopeWardId =
    level === "ward"
      ? scopeId
      : level === "polling_unit"
        ? (resolved.wardIds[0] ?? null)
        : null;

  return {
    scope_chain: Array.from(new Set(chain)),
    scope_ward_id: scopeWardId,
    visibility_ward_ids: resolved.wardIds,
    visibility_pu_ids:
      level === "polling_unit" ? [resolved.scope_id] : [],
  };
}

/* ============================================================
 * READS
 * ============================================================ */

/**
 * Every activity.
 *
 * UNSAFE for any non-admin: the rules (`firestore.rules` — the
 * campaign_activities read clauses) gate
 * each document on its own scope, and an unfiltered query cannot prove
 * any of them. Only admins and state-scoped coordinators (whose
 * `view_activities` grant is GLOBAL) may reach this.
 */
export async function getAllCampaignActivities(
  options: { db?: Firestore } = {},
): Promise<
  CampaignActivityRecord[]
> {
  const database = options.db ?? db;

  const snapshot = await campaignRead(
    { collection: "campaign_activities", filter: { all: true } },
    () => getDocs(query(collection(database, "campaign_activities"))),
  );

  return sortActivities(
    snapshot.docs.map((item) => mapActivity(item.id, item.data())),
  );
}

/**
 * Activities visible to the viewer.
 *
 * The old implementation asked for `scope_chain array-contains
 * "enugu-state"`, which matches EVERY activity in the state. Firestore
 * validates the whole query against the rules before streaming, so the
 * first document outside the viewer's five baseline scopes failed the
 * entire read — the campaign-page outage Round 7 fixed.
 *
 * Round 7.5 removes the remaining guesswork: the query set is the
 * viewer's `view_activities` GRANTS (`grantScopes`), not the hierarchy
 * above their home area. A PU coordinator holds `view_activities` at
 * their PU, ward, LGA, zone and state, so those five are queried; a
 * level they hold no grant for is never asked for and can therefore
 * never be denied.
 */
export async function getActivitiesInScope(
  scope: CampaignScope | null,
  grants: ViewerGrant[],
  options: { db?: Firestore } = {},
): Promise<CampaignActivityRecord[]> {
  if (!scope) return [];

  const database = options.db ?? db;
  const scopes = grantScopes(grants, ["view_activities"]);

  if (
    scope.level === "state" ||
    scope.level === "campaign" ||
    hasGlobalScope(scopes)
  ) {
    return getAllCampaignActivities(options);
  }

  const byId = new Map<string, CampaignActivityRecord>();

  const collect = (documents: Array<{ id: string; data: () => Record<string, unknown> }>) => {
    for (const document of documents) {
      byId.set(document.id, mapActivity(document.id, document.data()));
    }
  };

  const { groups } = groupScopeQueries(scopes);

  await Promise.all(
    groups.map(async (group) => {
      for (const ids of chunkIds(group.scope_ids)) {
        const snapshot = await campaignRead(
          {
            collection: "campaign_activities",
            filter: { scope_type: group.scope_type, scope_id: ids },
          },
          () =>
            getDocs(
              query(
                collection(database, "campaign_activities"),
                where("scope_type", "==", group.scope_type),
                where("scope_id", "in", ids),
              ),
            ),
        );

        collect(snapshot.docs);
      }
    }),
  );

  /*
   * PU-scoped activities inside the viewer's wards. The rules read the
   * stamped `scope_ward_id` against a WARD grant, so this is provable
   * only for wards where `view_activities` actually exists, and is
   * skipped entirely below ward level (a PU or plain member's own PU
   * query already covers their PU).
   */
  const scopeWards = new Set(activityWardIds(scope));

  const stampedWardIds = grantWardIds(grants, ["view_activities"]).filter(
    (wardId) => scopeWards.has(wardId),
  );

  for (const ids of chunkIds(stampedWardIds)) {
    const snapshot = await campaignRead(
      {
        collection: "campaign_activities",
        filter: { scope_type: "polling_unit", scope_ward_id: ids },
      },
      () =>
        getDocs(
          query(
            collection(database, "campaign_activities"),
            where("scope_type", "==", "polling_unit"),
            where("scope_ward_id", "in", ids),
          ),
        ),
    );

    collect(snapshot.docs);
  }

  return sortActivities(Array.from(byId.values()));
}

/**
 * Admin filter: activities at the selected scope or below.
 *
 * Admin-only by design: the `scope_chain` queries below are `array-contains`
 * reads that only the `isAdmin()` clause can prove.
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

  const snapshot = await campaignRead(
    {
      collection: "campaign_activities",
      filter: { scope_chain: scopeId },
    },
    () =>
      getDocs(
        query(
          collection(db, "campaign_activities"),
          where("scope_chain", "array-contains", scopeId),
        ),
      ),
  );

  for (const document of snapshot.docs) {
    byId.set(document.id, mapActivity(document.id, document.data()));
  }

  /* State-wide activities stay visible under every filter. */
  const stateWide = await campaignRead(
    { collection: "campaign_activities", filter: { scope_type: "state" } },
    () =>
      getDocs(
        query(
          collection(db, "campaign_activities"),
          where("scope_type", "==", "state"),
        ),
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
    scope_ward_id: visibility.scope_ward_id,
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
