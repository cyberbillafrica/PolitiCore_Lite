/*
 * ============================================================
 * ADMIN-SDK CAMPAIGN ACCESS TOOLKIT
 * ============================================================
 *
 * Shared by the three one-off scripts:
 *
 *   scripts/project-campaign-access.ts   ensure the baseline
 *   scripts/cleanup-stale-grants.ts      full recompute + cleanup
 *   scripts/verify-campaign-access.ts    read-only assertion
 *
 * The projection itself is NOT reimplemented here: every script calls
 * `computeExpectedCampaignAccess()` from `src/lib/campaign-access.ts`,
 * the same pure function the browser app uses. That is the only way the
 * migration and the running app can agree on what a user should have.
 *
 * Admin SDK because `user_access` is `allow read: if false` and
 * admin-only for writes.
 */

import * as fs from "fs";
import * as path from "path";

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import {
  ELECTION_RESULTS_PERMISSION,
  buildBaselineAccessDocs,
  computeExpectedCampaignAccess,
  type CampaignAccessAssignment,
  type CampaignAccessDoc,
  type CampaignAccessProfile,
} from "../../src/lib/campaign-access";

import type { LGA } from "../../src/types";

/** Firestore caps a batch at 500 operations. */
const WRITE_CHUNK = 450;

export const ACCESS_PROJECTION_IDS_FIELD = "access_projection_ids";

export interface AdminUserRecord {
  uid: string;
  name: string;
  profile: CampaignAccessProfile;
  data: Record<string, unknown>;
}

export interface UserPlan {
  uid: string;
  name: string;
  skipped?: string;
  expected: CampaignAccessDoc[];
  toAdd: CampaignAccessDoc[];
  /** Expected documents that must be rewritten to drop legacy fields. */
  toRewrite: CampaignAccessDoc[];
  toDelete: string[];
}

/* ============================================================
 * CONNECTION
 * ============================================================ */

export function connectAdmin(): {
  db: Firestore;
  projectId: string;
} {
  const serviceAccountPath = path.join(
    process.cwd(),
    "serviceAccountKey.json",
  );

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      "serviceAccountKey.json not found at the project root. The Admin SDK scripts need it.",
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8"),
  ) as { project_id?: string; client_email?: string; private_key?: string };

  if (!serviceAccount.project_id) {
    throw new Error("serviceAccountKey.json has no project_id.");
  }

  const app = initializeApp(
    {
      credential: cert(
        serviceAccount as Parameters<typeof cert>[0],
      ),
      projectId: serviceAccount.project_id,
    },
    `campaign-access-${Date.now()}`,
  );

  return {
    db: getFirestore(app),
    projectId: serviceAccount.project_id,
  };
}

/* ============================================================
 * HIERARCHY
 * ============================================================ */

/**
 * The LGA -> ward hierarchy the projection expands against.
 *
 * Read from the seeded `electoral_data/enugu-state` document. The
 * scripts REFUSE to run without it: an empty hierarchy would resolve
 * nothing, so every coordinator grant would look stale and be deleted.
 */
export async function loadHierarchy(db: Firestore): Promise<LGA[]> {
  const snapshot = await db.doc("electoral_data/enugu-state").get();

  if (!snapshot.exists) {
    throw new Error(
      "electoral_data/enugu-state is not seeded. Run `npx tsx scripts/seed-electoral-data.ts` first — the projection cannot expand LGA/zone scopes without it.",
    );
  }

  const data = snapshot.data() as { lgas?: LGA[] } | undefined;
  const lgas = data?.lgas ?? [];

  if (lgas.length === 0) {
    throw new Error(
      "electoral_data/enugu-state has no LGAs. Refusing to compute a projection that would delete every coordinator grant.",
    );
  }

  return lgas;
}

/* ============================================================
 * READS
 * ============================================================ */

export async function loadUsers(db: Firestore): Promise<AdminUserRecord[]> {
  const snapshot = await db.collection("users").get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;

    return {
      uid: doc.id,
      name:
        (typeof data.full_name === "string" && data.full_name) ||
        (typeof data.email === "string" && data.email) ||
        doc.id,
      profile: {
        access_role:
          typeof data.access_role === "string" ? data.access_role : null,
        membership_types: Array.isArray(data.membership_types)
          ? (data.membership_types as string[])
          : [],
        lga_id: typeof data.lga_id === "string" ? data.lga_id : null,
        ward_id: typeof data.ward_id === "string" ? data.ward_id : null,
        polling_unit_id:
          typeof data.polling_unit_id === "string"
            ? data.polling_unit_id
            : null,
      },
      data,
    };
  });
}

export async function loadActiveAssignments(
  db: Firestore,
  userIds: string[],
): Promise<Map<string, CampaignAccessAssignment[]>> {
  const result = new Map<string, CampaignAccessAssignment[]>();

  /* One collection read beats one query per user. */
  const snapshot = await db
    .collection("organizational_assignments")
    .where("status", "==", "active")
    .get();

  const wanted = new Set(userIds);

  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    const userId = String(data.user_id ?? "");

    if (!wanted.has(userId)) continue;

    const list = result.get(userId) ?? [];

    list.push({
      position: data.position as CampaignAccessAssignment["position"],
      scope_type: data.scope_type as CampaignAccessAssignment["scope_type"],
      scope_id: String(data.scope_id ?? ""),
      status: "active",
    });

    result.set(userId, list);
  }

  return result;
}

export interface ActualAccessDoc {
  id: string;
  permission: string;
  scope_type: string;
  scope_id: string;
  user_id: string;
  allowed: unknown;
  tenant_id?: unknown;
}

/**
 * Every `user_access` document currently recorded for a user.
 *
 * `where("user_id", "==", uid)` is a single-field equality, so it needs
 * no composite index.
 */
export async function loadActualAccessDocs(
  db: Firestore,
  userId: string,
): Promise<ActualAccessDoc[]> {
  const snapshot = await db
    .collection("user_access")
    .where("user_id", "==", userId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;

    return {
      id: doc.id,
      permission: String(data.permission ?? ""),
      scope_type: String(data.scope_type ?? ""),
      scope_id: String(data.scope_id ?? ""),
      user_id: String(data.user_id ?? ""),
      allowed: data.allowed,
      tenant_id: data.tenant_id,
    };
  });
}

/* ============================================================
 * PLANNING
 * ============================================================ */

function isLegacyDoc(doc: ActualAccessDoc): boolean {
  return (
    doc.tenant_id !== undefined ||
    doc.allowed !== true ||
    doc.user_id === "" ||
    doc.permission === ""
  );
}

/**
 * The full plan for one user: what they should have, what to add, what
 * to rewrite (legacy fields) and what to delete.
 *
 * Deletion covers EXACTLY the campaign namespace. The election
 * projection (`view_election_results`) is preserved untouched.
 */
export function planUser(params: {
  user: AdminUserRecord;
  assignments: CampaignAccessAssignment[];
  actual: ActualAccessDoc[];
  lgas: LGA[];
}): UserPlan {
  const { user, assignments, actual, lgas } = params;

  const expected = computeExpectedCampaignAccess({
    userId: user.uid,
    profile: user.profile,
    assignments,
    lgas,
  });

  const expectedById = new Map(expected.map((doc) => [doc.id, doc]));
  const actualById = new Map(actual.map((doc) => [doc.id, doc]));

  const toAdd = expected.filter((doc) => !actualById.has(doc.id));

  const toRewrite = expected.filter((doc) => {
    const current = actualById.get(doc.id);
    if (!current) return false;

    return isLegacyDoc(current);
  });

  const toDelete = actual
    .filter(
      (doc) =>
        doc.permission !== ELECTION_RESULTS_PERMISSION &&
        !expectedById.has(doc.id),
    )
    .map((doc) => doc.id);

  const campaignRelevant = actual.filter(
    (doc) => doc.permission !== ELECTION_RESULTS_PERMISSION,
  ).length;

  return {
    uid: user.uid,
    name: user.name,
    expected,
    toAdd,
    toRewrite,
    toDelete,
    skipped:
      expected.length === 0 && campaignRelevant === 0
        ? expectedSkipReason(user.profile)
        : undefined,
  };
}

export function expectedSkipReason(
  profile: CampaignAccessProfile,
): string {
  if (profile.access_role === "election_officer") {
    return "election_officer";
  }

  if (!(profile.membership_types ?? []).includes("campaign_member")) {
    return "not campaign_member";
  }

  if (!profile.polling_unit_id || !profile.ward_id || !profile.lga_id) {
    return "no home area";
  }

  return "not eligible";
}

/* ============================================================
 * APPLYING
 * ============================================================ */

function accessData(uid: string, doc: CampaignAccessDoc): Record<string, unknown> {
  return {
    user_id: uid,
    permission: doc.permission,
    allowed: true,
    scope_type: doc.scope_type,
    scope_id: doc.scope_id,
    updated_at: new Date(),
  };
}

/**
 * Apply a plan.
 *
 * Adds and rewrites first, deletions after, so an interrupted run never
 * leaves a user with fewer grants than they started with. `set()`
 * without merge replaces the document, which is what strips a legacy
 * `tenant_id` field.
 */
export async function applyPlan(
  db: Firestore,
  plan: UserPlan,
  options: { dryRun?: boolean } = {},
): Promise<{ written: number; deleted: number }> {
  const writes = [...plan.toAdd, ...plan.toRewrite.filter(
    (doc) => !plan.toAdd.some((added) => added.id === doc.id),
  )];

  if (options.dryRun) {
    return { written: writes.length, deleted: plan.toDelete.length };
  }

  for (let index = 0; index < writes.length; index += WRITE_CHUNK) {
    const chunk = writes.slice(index, index + WRITE_CHUNK);
    const batch = db.batch();

    for (const doc of chunk) {
      batch.set(
        db.collection("user_access").doc(doc.id),
        accessData(plan.uid, doc),
      );
    }

    await batch.commit();
  }

  for (let index = 0; index < plan.toDelete.length; index += WRITE_CHUNK) {
    const chunk = plan.toDelete.slice(index, index + WRITE_CHUNK);
    const batch = db.batch();

    for (const id of chunk) {
      batch.delete(db.collection("user_access").doc(id));
    }

    await batch.commit();
  }

  /* Record what this projection owns so the next in-app recompute can
   * diff without reading `user_access`. */
  await db.collection("users").doc(plan.uid).update({
    [ACCESS_PROJECTION_IDS_FIELD]: plan.expected.map((doc) => doc.id),
    updated_at: new Date(),
  });

  return { written: writes.length, deleted: plan.toDelete.length };
}

/* ============================================================
 * BASELINE-ONLY PLANNING (project-campaign-access.ts)
 * ============================================================ */

export interface BaselinePlan {
  uid: string;
  name: string;
  skipped?: string;
  baseline: CampaignAccessDoc[];
  toAdd: CampaignAccessDoc[];
  toDelete: string[];
}

export function planBaseline(params: {
  user: AdminUserRecord;
  actual: ActualAccessDoc[];
}): BaselinePlan {
  const { user, actual } = params;

  const baseline = buildBaselineAccessDocs(user.uid, user.profile);
  const actualById = new Map(actual.map((doc) => [doc.id, doc]));

  const toAdd = baseline.filter((doc) => !actualById.has(doc.id));

  /*
   * An ineligible user is entitled to NO campaign documents at all, so
   * everything except the election projection goes.
   *
   * For an ELIGIBLE user this script only ADDS the baseline: removing a
   * baseline document that sits at a previous home area needs the full
   * expected projection (a coordinator's own grants must survive), and
   * that is what `cleanup:grants` computes.
   */
  const toDelete =
    baseline.length === 0
      ? actual
          .filter((doc) => doc.permission !== ELECTION_RESULTS_PERMISSION)
          .map((doc) => doc.id)
      : [];

  if (baseline.length === 0) {
    return {
      uid: user.uid,
      name: user.name,
      skipped: expectedSkipReason(user.profile),
      baseline,
      toAdd: [],
      toDelete,
    };
  }

  return { uid: user.uid, name: user.name, baseline, toAdd, toDelete };
}

/** Apply a baseline-only plan (never rewrites or audits other grants). */
export async function applyBaselinePlan(
  db: Firestore,
  plan: BaselinePlan,
  options: { dryRun?: boolean } = {},
): Promise<{ written: number; deleted: number }> {
  if (options.dryRun) {
    return { written: plan.toAdd.length, deleted: plan.toDelete.length };
  }

  if (plan.toAdd.length > 0) {
    const batch = db.batch();

    for (const doc of plan.toAdd) {
      batch.set(
        db.collection("user_access").doc(doc.id),
        accessData(plan.uid, doc),
      );
    }

    await batch.commit();
  }

  if (plan.toDelete.length > 0) {
    const batch = db.batch();

    for (const id of plan.toDelete) {
      batch.delete(db.collection("user_access").doc(id));
    }

    await batch.commit();
  }

  return { written: plan.toAdd.length, deleted: plan.toDelete.length };
}
