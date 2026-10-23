import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import type { ScopeQueryGroup } from "@/lib/campaign-read-scope";
import type { LGA as Lga } from "@/types";

import { getTestEnv } from "./setup";

/*
 * ============================================================
 * SEED HELPERS
 * ============================================================
 *
 * Fixtures are written with the rules disabled (the emulator's
 * `withSecurityRulesDisabled` context), so a test can seed a user, their
 * projection and any collection document without first being an admin.
 *
 * Read assertions always go through the authenticated client context,
 * which is the thing under test.
 */

/* Geographic fixtures — real id shapes from the seeded hierarchy. */
export const LGA = "nkanu-west";
export const WARD_01 = "nkanu-west-ward-01";
export const WARD_02 = "nkanu-west-ward-02";
export const WARD_04 = "nkanu-west-ward-04";
export const PU_001 = "nkanu-west-ward-01-pu-001";
export const PU_002 = "nkanu-west-ward-01-pu-002";
export const PU_004_01 = "nkanu-west-ward-04-pu-001";
export const ZONE = "enugu-east";
export const STATE = "enugu-state";

/* A completely separate area, used for "outside my scope" assertions. */
export const OTHER_LGA = "nsukka";
export const OTHER_WARD = "nsukka-ward-01";
export const OTHER_PU = "nsukka-ward-01-pu-001";
export const OTHER_ZONE = "enugu-north";

/**
 * A minimal but REAL-shaped hierarchy. The projection only needs ids and
 * containment, so two LGAs with their wards/polling units are enough to
 * exercise every expansion path (LGA -> wards, zone -> LGAs -> wards).
 */
export const LGAS: Lga[] = [
  {
    id: LGA,
    code: "NW",
    name: "Nkanu West",
    wards: [
      {
        id: WARD_01,
        code: "W01",
        name: "Ward 01",
        pollingUnits: [
          { id: PU_001, code: "001", name: "PU 001" },
          { id: PU_002, code: "002", name: "PU 002" },
        ],
      },
      {
        id: WARD_02,
        code: "W02",
        name: "Ward 02",
        pollingUnits: [{ id: "nkanu-west-ward-02-pu-001", code: "001", name: "PU 001" }],
      },
      {
        id: WARD_04,
        code: "W04",
        name: "Ward 04",
        pollingUnits: [{ id: PU_004_01, code: "001", name: "PU 001" }],
      },
    ],
  },
  {
    id: OTHER_LGA,
    code: "NS",
    name: "Nsukka",
    wards: [
      {
        id: OTHER_WARD,
        code: "W01",
        name: "Ward 01",
        pollingUnits: [{ id: OTHER_PU, code: "001", name: "PU 001" }],
      },
    ],
  },
];

export interface SeedUserInput {
  access_role?: "admin" | "member" | "election_officer";
  membership_types?: string[];
  ward_id?: string | null;
  polling_unit_id?: string | null;
  lga_id?: string | null;
  full_name?: string;
  email?: string;
}

/** Write a `/users/{uid}` profile document. */
export async function seedUser(
  uid: string,
  input: SeedUserInput = {},
): Promise<void> {
  const env = getTestEnv();

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, "users", uid), {
      access_role: input.access_role ?? "member",
      membership_types: input.membership_types ?? ["campaign_member"],
      ward_id: input.ward_id ?? WARD_01,
      polling_unit_id: input.polling_unit_id ?? PU_001,
      lga_id: input.lga_id ?? LGA,
      full_name: input.full_name ?? uid,
      email: input.email ?? `${uid}@example.test`,
      points: 0,
      rank: "member",
      created_at: new Date(),
    });
  });
}

export const accessId = (
  uid: string,
  permission: string,
  scopeType: string,
  scopeId: string,
): string =>
  scopeType === "global"
    ? `${uid}__${permission}__global`
    : `${uid}__${permission}__${scopeType}__${scopeId}`;

/** The 9 baseline documents described by docs/campaign-member-baseline.md. */
export async function seedBaselineAccess(
  uid: string,
  puId = PU_001,
  wardId = WARD_01,
  lgaId = LGA,
  zoneId = ZONE,
): Promise<void> {
  const docs: Array<[string, string, string]> = [
    ["view_activities", "polling_unit", puId],
    ["view_activities", "ward", wardId],
    ["view_activities", "lga", lgaId],
    ["view_activities", "senatorial_zone", zoneId],
    ["view_activities", "state", STATE],
    ["view_members", "polling_unit", puId],
    ["view_assignments", "polling_unit", puId],
    ["submit_field_report", "polling_unit", puId],
    ["report_issue", "polling_unit", puId],
  ];

  await seedAccessDocs(uid, docs);
}

/** Write an arbitrary set of `user_access` documents. */
export async function seedAccessDocs(
  uid: string,
  docs: Array<[permission: string, scopeType: string, scopeId: string]>,
): Promise<void> {
  const env = getTestEnv();

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);

    for (const [permission, scopeType, scopeId] of docs) {
      batch.set(
        doc(db, "user_access", accessId(uid, permission, scopeType, scopeId)),
        {
          user_id: uid,
          permission,
          allowed: true,
          scope_type: scopeType,
          scope_id: scopeId,
          updated_at: new Date(),
        },
      );
    }

    await batch.commit();
  });
}

/** Coordinator grants at one scope, mirroring CAMPAIGN_PROJECTION_PERMISSIONS. */
export const COORDINATOR_PERMISSIONS = [
  "view_members",
  "view_assignments",
  "create_assignment",
  "assign_task",
  "review_assignment",
  "view_activities",
  "create_activity",
  "manage_activity",
  "submit_field_report",
  "review_field_report",
  "report_issue",
  "manage_issue",
];

export async function seedCoordinatorAccess(
  uid: string,
  scopeType: string,
  scopeId: string,
): Promise<void> {
  await seedAccessDocs(
    uid,
    COORDINATOR_PERMISSIONS.map((permission) => [
      permission,
      scopeType,
      scopeId,
    ] as [string, string, string]),
  );
}

/**
 * An activity exactly as the app writes it: scope fields plus the
 * visibility stamps the membership read rule consults.
 */
export async function seedActivity(input: {
  id?: string;
  title?: string;
  scope_type?: string;
  scope_id?: string;
  scope_ward_id?: string | null;
  scope_chain?: string[];
  visibility_ward_ids?: string[];
  visibility_pu_ids?: string[];
  created_by?: string;
}): Promise<string> {
  const env = getTestEnv();
  const id =
    input.id ??
    `activity-${Math.random().toString(36).slice(2, 10)}`;

  const scopeType = input.scope_type ?? "ward";
  const scopeId = input.scope_id ?? WARD_01;

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, "campaign_activities", id), {
      title: input.title ?? `Activity at ${scopeId}`,
      activity_type: "meeting",
      status: "scheduled",
      date: "2027-01-10",
      scope_type: scopeType,
      scope_id: scopeId,
      scope_ward_id: input.scope_ward_id ?? null,
      scope_chain: input.scope_chain ?? [STATE, ZONE, LGA, scopeId],
      visibility_ward_ids: input.visibility_ward_ids ?? [],
      visibility_pu_ids: input.visibility_pu_ids ?? [],
      created_by: input.created_by ?? "admin-uid",
      organizer_id: "admin-uid",
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  return id;
}

export async function seedAssignment(input: {
  id?: string;
  assigned_to_user?: string | null;
  /** Pre-Round-5 assignee field; defaults to `assigned_to_user`. */
  assigned_to?: string | null;
  created_by?: string;
  scope_type?: string;
  scope_id?: string;
  target_ward_id?: string | null;
  assigned_to_scope?: Record<string, unknown> | null;
}): Promise<string> {
  const env = getTestEnv();
  const id =
    input.id ??
    `assignment-${Math.random().toString(36).slice(2, 10)}`;

  const scopeType = input.scope_type ?? "ward";
  const scopeId = input.scope_id ?? WARD_01;

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, "campaign_assignments", id), {
      title: `Assignment ${id}`,
      created_by: input.created_by ?? "admin-uid",
      created_at: new Date(),
      updated_at: new Date(),
      status: "open",
      completion_mode: "per_person",
      priority: "medium",
      due_at: null,
      assigned_to_user: input.assigned_to_user ?? null,
      assigned_to_scope:
        input.assigned_to_scope ?? {
          level: scopeType,
          scope_id: scopeId,
          role_filter: null,
        },
      assigned_to:
        input.assigned_to !== undefined
          ? (input.assigned_to ?? "")
          : (input.assigned_to_user ?? ""),
      assigned_by: input.created_by ?? "admin-uid",
      scope_type: scopeType,
      scope_id: scopeId,
      due_date: null,
      created_scope: null,
      target_ward_id: input.target_ward_id ?? null,
    });
  });

  return id;
}

export async function seedIssue(input: {
  id?: string;
  raised_by?: string;
  scope_level?: string;
  scope_id?: string;
  scope_ward_id?: string | null;
}): Promise<string> {
  const env = getTestEnv();
  const id = input.id ?? `issue-${Math.random().toString(36).slice(2, 10)}`;

  const scopeLevel = input.scope_level ?? "polling_unit";
  const scopeId = input.scope_id ?? PU_001;

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, "issues", id), {
      title: `Issue ${id}`,
      description: "Seed issue",
      issue_type: "other",
      priority: "medium",
      status: "reported",
      raised_by: input.raised_by ?? "member-uid",
      raised_at: new Date(),
      scope_level: scopeLevel,
      scope_id: scopeId,
      scope_ward_id: input.scope_ward_id ?? null,
      reported_by: input.raised_by ?? "member-uid",
      scope_type: scopeLevel,
      location: null,
      assigned_to: null,
      evidence_url: null,
      resolution_notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  return id;
}

export async function seedReport(input: {
  id?: string;
  submitted_by?: string;
  assignment_creator_id?: string;
  assignment_id?: string;
  scope_level?: string;
  scope_id?: string;
  scope_snapshot?: Record<string, unknown> | null;
}): Promise<string> {
  const env = getTestEnv();
  const id = input.id ?? `report-${Math.random().toString(36).slice(2, 10)}`;

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, "campaign_field_reports", id), {
      assignment_id: input.assignment_id ?? "assignment-1",
      assignment_creator_id: input.assignment_creator_id ?? "coordinator-uid",
      submitted_by: input.submitted_by ?? "member-uid",
      submitted_at: new Date(),
      title: `Report ${id}`,
      content: "Seed report",
      description: "Seed report",
      status: "submitted",
      scope_level: input.scope_level ?? "polling_unit",
      scope_id: input.scope_id ?? PU_001,
      scope_type: input.scope_level ?? "polling_unit",
      scope_snapshot: input.scope_snapshot ?? null,
      reviewed_by: null,
      reviewed_at: null,
      review_notes: null,
      review_comment: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  return id;
}

export async function seedOrganizationalAssignment(input: {
  id?: string;
  user_id: string;
  position?: string;
  scope_type?: string;
  scope_id?: string;
  status?: string;
}): Promise<string> {
  const env = getTestEnv();
  const id =
    input.id ?? `org-${Math.random().toString(36).slice(2, 10)}`;

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, "organizational_assignments", id), {
      user_id: input.user_id,
      position: input.position ?? "ward_coordinator",
      scope_type: input.scope_type ?? "ward",
      scope_id: input.scope_id ?? WARD_01,
      status: input.status ?? "active",
      assigned_by: "admin-uid",
      assigned_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  return id;
}

/**
 * Run exactly the queries the data layer issues for a set of scope
 * groups, merged by document id.
 *
 * This mirrors `groupScopeQueries()` + `chunkIds()` in the production
 * readers, so a passing assertion proves the FILTER is scope-safe
 * against the deployed rules.
 */
export async function queryByScopes(
  db: Firestore,
  collectionName: string,
  groups: ScopeQueryGroup[],
): Promise<Map<string, Record<string, unknown>>> {
  const byId = new Map<string, Record<string, unknown>>();

  for (const group of groups) {
    for (let index = 0; index < group.scope_ids.length; index += 30) {
      const ids = group.scope_ids.slice(index, index + 30);

      const snapshot = await getDocs(
        query(
          collection(db, collectionName),
          where("scope_type", "==", group.scope_type),
          where("scope_id", "in", ids),
        ),
      );

      for (const document of snapshot.docs) {
        byId.set(document.id, document.data());
      }
    }
  }

  return byId;
}

/** An authenticated Firestore client, i.e. the thing under test. */
export function authAs(uid: string): Firestore {
  /*
   * The rules-testing package bundles its own copy of the Firestore TYPES,
   * so the value is structurally identical but nominally different from
   * `firebase/firestore`. The cast is type-only — the same instance is
   * handed to the modular query helpers.
   */
  return getTestEnv()
    .authenticatedContext(uid)
    .firestore() as unknown as Firestore;
}

/** Unauthenticated client, for the signed-out assertions. */
export function anonDb(): Firestore {
  return getTestEnv()
    .unauthenticatedContext()
    .firestore() as unknown as Firestore;
}

/** Rules-disabled client, for assertions on seeded state. */
export function adminDb(): Firestore {
  /* `withSecurityRulesDisabled` is async; tests that only read can use
   * `getTestEnv().withSecurityRulesDisabled(cb)`. */
  return getTestEnv()
    .authenticatedContext("admin-probe")
    .firestore() as unknown as Firestore;
}
