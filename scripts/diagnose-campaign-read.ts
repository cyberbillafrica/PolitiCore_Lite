/*
 * ============================================================
 * CAMPAIGN READ DIAGNOSTIC — READ ONLY
 * ============================================================
 *
 * Run:
 *   npm run diagnose:campaign-read -- <uid>
 *
 * Answers, for one user, why a campaign page read fails with
 * "Missing or insufficient permissions":
 *
 *   1. profile + active organizational assignment (the authority the
 *      client resolves)
 *   2. the grants the CLIENT derives (viewerGrants)
 *   3. the grants the SERVER actually holds (user_access documents)
 *   4. per collection: which documents the resolver's queries would
 *      return, and whether EACH one passes the deployed rule
 *   5. the exact query plan the resolver builds, with chunk counts
 *
 * It never writes, and it uses the Admin SDK only to read state the
 * rules hide from the client (`user_access`, other users' docs). The
 * rule evaluation below is a transcription of firestore.rules — it is
 * a diagnosis tool, not the authority. The rules remain the authority.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import * as fs from "fs";
import * as path from "path";

import {
  buildCampaignAccessDocId,
  CAMPAIGN_PROJECTION_PERMISSIONS,
  type CampaignAccessProfile,
} from "../src/lib/campaign-access";
import {
  activityWardIds,
  chunkIds,
  grantScopes,
  grantWardIds,
  groupScopeQueries,
  hasGlobalScope,
  RULES_ACCESS_BUDGET_LIMIT,
  scopeKey,
  viewerGrants,
  type ReadScope,
  type ViewerGrant,
} from "../src/lib/campaign-read-scope";
import {
  positionScopeLevel,
  resolveCampaignAuthority,
  resolveCampaignScope,
  type CampaignScope,
} from "../src/lib/campaign-scope";

import type {
  LGA,
  OrganizationalAssignment,
  ScopeType,
  UserProfile,
} from "../src/types";

/* ============================================================
 * CONNECTION (same shape as the campaign-access scripts)
 * ============================================================ */

function connectAdmin(): Firestore {
  const serviceAccountPath = path.join(
    process.cwd(),
    "serviceAccountKey.json",
  );

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      "serviceAccountKey.json not found at the project root.",
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8"),
  ) as { project_id?: string };

  const app = initializeApp(
    {
      credential: cert(
        JSON.parse(
          fs.readFileSync(serviceAccountPath, "utf8"),
        ) as Parameters<typeof cert>[0],
      ),
      projectId: serviceAccount.project_id,
    },
    `diagnose-campaign-read-${Date.now()}`,
  );

  return getFirestore(app);
}

/* ============================================================
 * OUTPUT HELPERS
 * ============================================================ */

function heading(text: string) {
  console.log(`\n${"=".repeat(70)}\n${text}\n${"=".repeat(70)}`);
}

function sub(text: string) {
  console.log(`\n--- ${text} ${"-".repeat(Math.max(0, 60 - text.length))}`);
}

function show(value: unknown): string {
  if (value === undefined) return "<absent>";
  if (value === null) return "null";
  return JSON.stringify(value);
}

/* ============================================================
 * RULES ACCESS-BUDGET MODEL
 * ============================================================
 *
 * Firestore charges a list read for EVERY value in an `in` list
 * before it settles the query, and `hasAccess()` looks at:
 *
 *   hasGlobalAccess .. exists() on the global doc
 *   hasScopedAccess .. exists() + get() + get() on the scoped doc
 *
 * i.e. four document accesses per value for a viewer with no global
 * grant. The emulator sweep measured the ceiling directly: 8 values
 * passed and 9 were denied for BOTH `issues` and
 * `campaign_activities`, so the budget is 32 accesses and the fix
 * caps a chunk at six (see RULES_ACCESS_BUDGET_LIMIT).
 */
const ACCESS_BUDGET = 32;
const READS_PER_IN_VALUE = 4;
const OLD_CHUNK_SIZE = 30;

/** Local chunker, so the OLD 30-value plan stays reproducible. */
function chunkIdsTo(ids: string[], size: number): string[][] {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const chunks: string[][] = [];

  for (let index = 0; index < unique.length; index += size) {
    chunks.push(unique.slice(index, index + size));
  }

  return chunks;
}

/* ============================================================
 * RULE EVALUATION — transcription of firestore.rules
 * ============================================================ */

type ActualGrant = {
  id: string;
  permission: string;
  scope_type: string;
  scope_id: string;
  allowed: boolean;
  user_id: string;
};

function grantKey(permission: string, scopeType: string, scopeId: string) {
  return scopeType === "global"
    ? `${permission}@global`
    : `${permission}@${scopeType}:${scopeId}`;
}

function actualGrantSet(grants: ActualGrant[]): Set<string> {
  return new Set(
    grants
      .filter((grant) => grant.allowed)
      .map((grant) =>
        grantKey(grant.permission, grant.scope_type, grant.scope_id),
      ),
  );
}

function hasAccess(
  set: Set<string>,
  permission: string,
  scopeType: string,
  scopeId: string,
): boolean {
  return (
    set.has(grantKey(permission, "global", "")) ||
    set.has(grantKey(permission, scopeType, scopeId))
  );
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

interface Verdict {
  pass: boolean;
  clause: string;
}

/**
 * Evaluate the read clauses for one document, in rule order. The first
 * clause that passes wins, exactly like an `allow read` chain.
 */
function evaluateDoc(
  collection: string,
  doc: Record<string, unknown>,
  uid: string,
  grants: Set<string>,
): Verdict {
  const scopeType = String(doc.scope_type ?? "");
  const scopeId = String(doc.scope_id ?? "");
  const stampedWard = String(doc.scope_ward_id ?? "");
  const targetWard = String(doc.target_ward_id ?? "");

  switch (collection) {
    case "campaign_activities": {
      if (
        !isBlank(stampedWard) &&
        hasAccess(grants, "view_activities", "ward", stampedWard)
      ) {
        return {
          pass: true,
          clause: `view_activities@ward:${stampedWard} (via scope_ward_id)`,
        };
      }
      if (hasAccess(grants, "view_activities", scopeType, scopeId)) {
        return {
          pass: true,
          clause: `view_activities@${scopeType}:${scopeId} (own scope)`,
        };
      }
      if (scopeType === "polling_unit" && isBlank(stampedWard)) {
        return {
          pass: false,
          clause:
            "PU-scoped row has no scope_ward_id and caller holds no " +
            `view_activities@polling_unit:${scopeId}`,
        };
      }
      return {
        pass: false,
        clause: `needs view_activities@${scopeType}:${scopeId} or ` +
          `view_activities@ward:<scope_ward_id>; stamp=${show(
            doc.scope_ward_id,
          )}`,
      };
    }

    case "issues": {
      if (doc.raised_by === uid) {
        return { pass: true, clause: "raised_by == caller" };
      }
      if (doc.reported_by === uid) {
        return { pass: true, clause: "reported_by == caller" };
      }
      if (hasAccess(grants, "manage_issue", scopeType, scopeId)) {
        return {
          pass: true,
          clause: `manage_issue@${scopeType}:${scopeId} (own scope)`,
        };
      }
      if (
        !isBlank(stampedWard) &&
        hasAccess(grants, "manage_issue", "ward", stampedWard)
      ) {
        return {
          pass: true,
          clause: `manage_issue@ward:${stampedWard} (via scope_ward_id)`,
        };
      }
      return {
        pass: false,
        clause: `needs manage_issue@${scopeType}:${scopeId} or ` +
          `manage_issue@ward:<scope_ward_id>; stamp=${show(
            doc.scope_ward_id,
          )}`,
      };
    }

    case "campaign_assignments": {
      if (doc.assigned_to === uid) {
        return { pass: true, clause: "assigned_to == caller (legacy)" };
      }
      if (doc.assigned_to_user === uid) {
        return { pass: true, clause: "assigned_to_user == caller" };
      }
      if (doc.assigned_by === uid) {
        return { pass: true, clause: "assigned_by == caller (legacy)" };
      }
      if (doc.created_by === uid) {
        return { pass: true, clause: "created_by == caller" };
      }
      if (hasAccess(grants, "view_assignments", scopeType, scopeId)) {
        return {
          pass: true,
          clause: `view_assignments@${scopeType}:${scopeId} (own scope)`,
        };
      }
      if (
        !isBlank(targetWard) &&
        hasAccess(grants, "view_assignments", "ward", targetWard)
      ) {
        return {
          pass: true,
          clause: `view_assignments@ward:${targetWard} (via target_ward_id)`,
        };
      }
      return {
        pass: false,
        clause: `needs view_assignments@${scopeType}:${scopeId} or ` +
          `view_assignments@ward:<target_ward_id>; target_ward_id=${show(
            doc.target_ward_id,
          )}`,
      };
    }

    case "campaign_field_reports": {
      if (doc.submitted_by === uid) {
        return { pass: true, clause: "submitted_by == caller" };
      }
      if (doc.assignment_creator_id === uid) {
        return { pass: true, clause: "assignment_creator_id == caller" };
      }
      if (hasAccess(grants, "review_field_report", scopeType, scopeId)) {
        return {
          pass: true,
          clause: `review_field_report@${scopeType}:${scopeId}`,
        };
      }
      return {
        pass: false,
        clause: `needs submitted_by / assignment_creator_id == caller or ` +
          `review_field_report@${scopeType}:${scopeId}; ` +
          `assignment_creator_id=${show(doc.assignment_creator_id)}`,
      };
    }

    default:
      return { pass: false, clause: "unknown collection" };
  }
}

/* ============================================================
 * QUERY PLAN — mirrors each data module's reader
 * ============================================================ */

interface PlannedQuery {
  collection: string;
  shape: "scope" | "stamped-ward" | "stamped-target-ward" | "identity";
  scope_type?: string;
  ids: string[];
  filter: Record<string, unknown>;
  /** Returns true when the query would return the document. */
  matches: (doc: Record<string, unknown>) => boolean;
}

const COLLECTION_PLANS = [
  {
    collection: "campaign_activities",
    permission: "view_activities",
    stampField: "scope_ward_id",
    stampShape: "stamped-ward",
  },
  {
    collection: "issues",
    permission: "manage_issue",
    stampField: "scope_ward_id",
    stampShape: "stamped-ward",
  },
  {
    collection: "campaign_assignments",
    permission: "view_assignments",
    stampField: "target_ward_id",
    stampShape: "stamped-target-ward",
  },
  {
    collection: "campaign_field_reports",
    permission: "review_field_report",
    stampField: null,
    stampShape: null,
  },
] as const;

/**
 * The queries `get*InScope()` would fire for this viewer, given the
 * scope the page resolved and the grants the client derived.
 */
function planQueries(
  collection: string,
  scope: CampaignScope,
  grants: ViewerGrant[],
  chunkSize: number = RULES_ACCESS_BUDGET_LIMIT,
): PlannedQuery[] {
  const plan = COLLECTION_PLANS.find((item) => item.collection === collection);
  if (!plan) return [];

  /* Reports read by identity only — no scope fan-out. */
  if (!plan.stampShape) return [];

  const scopes = grantScopes(grants, [plan.permission]);

  if (
    scope.level === "state" ||
    scope.level === "campaign" ||
    hasGlobalScope(scopes)
  ) {
    return [
      {
        collection,
        shape: "identity",
        ids: [],
        filter: { all: true },
        matches: () => true,
      },
    ];
  }

  const queries: PlannedQuery[] = [];

  const { groups } = groupScopeQueries(scopes);

  for (const group of groups) {
    for (const ids of chunkIdsTo(group.scope_ids, chunkSize)) {
      queries.push({
        collection,
        shape: "scope",
        scope_type: group.scope_type,
        ids,
        filter: { scope_type: group.scope_type, scope_id: ids },
        matches: (doc) =>
          doc.scope_type === group.scope_type && ids.includes(String(doc.scope_id ?? "")),
      });
    }
  }

  const scopeWards =
    collection === "campaign_activities"
      ? new Set(activityWardIds(scope))
      : new Set(scope.level === "polling_unit" ? [] : (scope.wardIds ?? []));

  const stampedWardIds = grantWardIds(grants, [plan.permission]).filter(
    (wardId) => scopeWards.has(wardId),
  );

  for (const ids of chunkIdsTo(stampedWardIds, chunkSize)) {
    if (collection === "campaign_activities") {
      const puGranted = new Set(
        grantScopes(grants, [plan.permission])
          .filter((item) => item.scope_type === "polling_unit")
          .map((item) => item.scope_id),
      );

      queries.push({
        collection,
        shape: plan.stampShape,
        ids,
        filter: { scope_type: "polling_unit", scope_ward_id: ids },
        matches: (doc) =>
          doc.scope_type === "polling_unit" &&
          ids.includes(String(doc.scope_ward_id ?? "")),
      });

      void puGranted;
      continue;
    }

    queries.push({
      collection,
      shape: plan.stampShape,
      ids,
      filter: { [plan.stampField as string]: ids },
      matches: (doc) =>
        ids.includes(String(doc[plan.stampField as string] ?? "")),
    });
  }

  return queries;
}

/* ============================================================
 * VERIFY — OLD vs NEW QUERY PLAN, WITH THE BUDGET MODEL
 * ============================================================ */

/** Production LGA coordinator used when `--verify` gets no uid. */
const VERIFY_UID = "pWO5FfesLTZTcntnNMgmfyqLZQa2";

interface BudgetRow {
  label: string;
  values: number;
  reads: number;
  ok: boolean;
}

function budgetRows(
  collection: string,
  scope: CampaignScope,
  grants: ViewerGrant[],
  chunkSize: number,
): BudgetRow[] {
  return planQueries(collection, scope, grants, chunkSize).map((query) => {
    const values = query.ids.length;
    const reads = values * READS_PER_IN_VALUE;

    return {
      label: `${query.shape}${query.scope_type ? ` ${query.scope_type}` : ""}`,
      values,
      reads,
      ok: reads <= ACCESS_BUDGET,
    };
  });
}

function printPlan(
  title: string,
  rows: BudgetRow[],
): { queries: number; over: number } {
  const over = rows.filter((row) => !row.ok).length;

  console.log(
    `\n  ${title}: ${rows.length} queries | ${over} over budget`,
  );

  for (const row of rows) {
    console.log(
      `    ${row.label.padEnd(30)} ${String(row.values).padStart(3)} value(s)` +
        ` -> ${String(row.reads).padStart(3)} reads  ${row.ok ? "ok" : "DENY"}`,
    );
  }

  return { queries: rows.length, over };
}

function printVerification(
  uid: string,
  scope: CampaignScope,
  grants: ViewerGrant[],
) {
  sub(`VERIFY — OLD 30-cap vs NEW ${RULES_ACCESS_BUDGET_LIMIT}-cap plan`);

  console.log(`uid: ${uid} | scope: ${scope.level}:${scope.scope_id}`);
  console.log(
    `budget model: ${READS_PER_IN_VALUE} reads per in-list value ` +
      `(hasGlobalAccess exists + hasScopedAccess exists + 2 gets), ` +
      `budget ${ACCESS_BUDGET} accesses per query`,
  );
  console.log("measured on the emulator: 8 values pass, 9 values deny");

  let oldQueries = 0;
  let newQueries = 0;
  let oldOver = 0;
  let newOver = 0;

  for (const plan of COLLECTION_PLANS) {
    console.log(`\n${plan.collection}`);

    if (!plan.stampShape) {
      console.log(
        "    identity submitted_by + assignment_creator_id: " +
          "2 queries, 1 value each -> within budget",
      );
      continue;
    }

    const oldTally = printPlan(
      "OLD 30-cap",
      budgetRows(plan.collection, scope, grants, OLD_CHUNK_SIZE),
    );

    const newTally = printPlan(
      `NEW ${RULES_ACCESS_BUDGET_LIMIT}-cap`,
      budgetRows(
        plan.collection,
        scope,
        grants,
        RULES_ACCESS_BUDGET_LIMIT,
      ),
    );

    oldQueries += oldTally.queries;
    oldOver += oldTally.over;
    newQueries += newTally.queries;
    newOver += newTally.over;
  }

  const who =
    scope.level === "lga" ? "LGA coordinator" : `${scope.level} coordinator`;

  console.log(
    `\n${who}: OLD would fire ${oldQueries} queries, ${oldOver} of them ` +
      `over the access budget (every page read fails); NEW fires ` +
      `${newQueries} queries, ${newOver} over budget.`,
  );
}

/* ============================================================
 * MAIN
 * ============================================================ */

async function listCoordinators(db: Firestore) {
  /* Unfiltered on purpose: an assignment written without a `status`
   * field is treated as active by the projection, and a `status`
   * equality filter would hide exactly those rows. */
  const snapshot = await db.collection("organizational_assignments").get();

  const coordinatorPositions = [
    "pu_coordinator",
    "ward_coordinator",
    "lga_coordinator",
    "zone_coordinator",
    "state_coordinator",
  ];

  heading("COORDINATOR ASSIGNMENTS (read only)");

  const seen = new Set<string>();

  for (const item of snapshot.docs) {
    const data = item.data() as Record<string, unknown>;
    const position = String(data.position ?? "");

    if (!coordinatorPositions.includes(position)) continue;

    const uid = String(data.user_id ?? "");
    const scopeType = String(data.scope_type ?? "");
    const scopeId = String(data.scope_id ?? "");
    const status = String(data.status ?? "<none>");
    const key = `${uid}|${position}|${scopeType}|${scopeId}`;

    if (seen.has(key)) continue;
    seen.add(key);

    console.log(
      `${position.padEnd(19)} ${scopeType}:${scopeId}  ` +
        `status=${status.padEnd(7)} uid=${uid}`,
    );
  }

  console.log(`\ntotal: ${seen.size}`);
}

async function main() {
  const args = process.argv
    .slice(2)
    .map((value) => value.trim())
    .filter(Boolean);

  const verify = args.includes("--verify");
  const uid =
    args.find((value) => value !== "--verify") ?? (verify ? VERIFY_UID : "");

  if (!uid) {
    console.error(
      "Usage: npm run diagnose:campaign-read -- <uid> [--verify]\n" +
        "       npm run diagnose:campaign-read -- --coordinators\n" +
        "       npm run diagnose:campaign-read -- --verify   (defaults to Mr Timothy)",
    );
    process.exit(2);
  }

  const db = connectAdmin();

  if (uid === "--coordinators") {
    await listCoordinators(db);
    return;
  }

  /* ---------------------------------------------------------- */
  heading(`PHASE A DIAGNOSTIC — uid ${uid}`);

  const hierarchyDoc = await db.doc("electoral_data/enugu-state").get();
  const lgas = (hierarchyDoc.data()?.lgas ?? []) as LGA[];

  console.log(`hierarchy: ${lgas.length} LGAs loaded from electoral_data/enugu-state`);

  const userDoc = await db.doc(`users/${uid}`).get();

  if (!userDoc.exists) {
    console.log(`FATAL: users/${uid} does not exist.`);
    process.exit(1);
  }

  const userData = userDoc.data() as Record<string, unknown>;

  const profile: CampaignAccessProfile = {
    access_role:
      typeof userData.access_role === "string" ? userData.access_role : null,
    membership_types: Array.isArray(userData.membership_types)
      ? (userData.membership_types as string[])
      : [],
    lga_id: typeof userData.lga_id === "string" ? userData.lga_id : null,
    ward_id: typeof userData.ward_id === "string" ? userData.ward_id : null,
    polling_unit_id:
      typeof userData.polling_unit_id === "string"
        ? userData.polling_unit_id
        : null,
  };

  sub("1. PROFILE");
  console.log(JSON.stringify(profile, null, 2));
  console.log(
    `full_name: ${show(userData.full_name)} | status: ${show(userData.status)}`,
  );

  /* ---------------------------------------------------------- */
  const assignmentSnapshot = await db
    .collection("organizational_assignments")
    .where("user_id", "==", uid)
    .get();

  const assignments: OrganizationalAssignment[] = assignmentSnapshot.docs
    .map((item) => item.data() as Record<string, unknown>)
    .filter((data) => (data.status ?? "active") === "active")
    .map((data) => ({
      id: String(data.id ?? ""),
      user_id: uid,
      position: data.position as OrganizationalAssignment["position"],
      scope_type: data.scope_type as OrganizationalAssignment["scope_type"],
      scope_id: String(data.scope_id ?? ""),
      status: "active",
      assigned_by: String(data.assigned_by ?? ""),
      assigned_at: data.assigned_at as OrganizationalAssignment["assigned_at"],
    }));

  sub("2. ACTIVE ORGANIZATIONAL ASSIGNMENTS");
  console.log(`count: ${assignments.length}`);

  for (const assignment of assignments) {
    console.log(
      `  ${assignment.position} @ ${assignment.scope_type}:${assignment.scope_id}`,
    );
  }

  const authority = resolveCampaignAuthority(
    { id: uid, ...profile } as unknown as UserProfile,
    assignments,
  );

  console.log(`\nresolved position: ${show(authority.position)}`);
  console.log(
    `position level: ${show(positionScopeLevel(authority.position))}`,
  );
  console.log(`authority scope_id: ${show(authority.scopeId)}`);

  /* ---------------------------------------------------------- */
  const derived = viewerGrants({
    userId: uid,
    profile,
    assignments,
    lgas,
  });

  sub("3. DERIVED GRANTS (what the CLIENT queries with)");
  console.log(`count: ${derived.length}`);

  const byPermission = new Map<string, number>();
  const byType = new Map<string, number>();

  for (const grant of derived) {
    byPermission.set(
      grant.permission,
      (byPermission.get(grant.permission) ?? 0) + 1,
    );
    byType.set(
      grant.scope_type,
      (byType.get(grant.scope_type) ?? 0) + 1,
    );
  }

  console.log(
    `by permission: ${JSON.stringify(Object.fromEntries(byPermission))}`,
  );
  console.log(`by scope type: ${JSON.stringify(Object.fromEntries(byType))}`);

  for (const grant of derived.slice(0, 8)) {
    console.log(
      `  sample ${grant.permission} @ ${grant.scope_type}:${grant.scope_id}`,
    );
  }

  /* ---------------------------------------------------------- */
  const accessSnapshot = await db
    .collection("user_access")
    .where("user_id", "==", uid)
    .get();

  const actual: ActualGrant[] = accessSnapshot.docs.map((item) => {
    const data = item.data() as Record<string, unknown>;

    return {
      id: item.id,
      permission: String(data.permission ?? ""),
      scope_type: String(data.scope_type ?? ""),
      scope_id: String(data.scope_id ?? ""),
      allowed: data.allowed !== false,
      user_id: String(data.user_id ?? ""),
    };
  });

  const actualById = new Map(actual.map((grant) => [grant.id, grant]));

  sub("4. ACTUAL user_access DOCUMENTS (what the SERVER holds)");
  console.log(`count (query user_id == uid): ${actual.length}`);

  for (const grant of actual.slice(0, 8)) {
    console.log(
      `  sample ${grant.permission} @ ${grant.scope_type}:${grant.scope_id} ` +
        `(allowed=${grant.allowed})`,
    );
  }

  /*
   * Documents the derived list expects but Firestore does not have are
   * exactly the queries that will be denied: the client asks for a pair
   * the rules cannot find. Report the counts per permission and a few
   * ids, never the whole list.
   */
  const missing: Array<{ permission: string; scope_type: string; scope_id: string }> =
    [];

  for (const grant of derived) {
    const id =
      grant.scope_type === "global"
        ? buildCampaignAccessDocId(uid, grant.permission, "global", "")
        : buildCampaignAccessDocId(
            uid,
            grant.permission,
            grant.scope_type as ScopeType,
            grant.scope_id,
          );

    if (!actualById.has(id)) {
      missing.push({
        permission: grant.permission,
        scope_type: grant.scope_type,
        scope_id: grant.scope_id,
      });
    }
  }

  const missingByPermission = new Map<string, number>();
  const missingByType = new Map<string, number>();

  for (const item of missing) {
    missingByPermission.set(
      item.permission,
      (missingByPermission.get(item.permission) ?? 0) + 1,
    );
    missingByType.set(
      item.scope_type,
      (missingByType.get(item.scope_type) ?? 0) + 1,
    );
  }

  console.log(`\nDERIVED BUT MISSING IN FIRESTORE: ${missing.length}`);
  console.log(
    `by permission: ${JSON.stringify(
      Object.fromEntries(missingByPermission),
    )}`,
  );
  console.log(
    `by scope type: ${JSON.stringify(Object.fromEntries(missingByType))}`,
  );

  for (const item of missing.slice(0, 12)) {
    console.log(
      `  missing ${item.permission} @ ${item.scope_type}:${item.scope_id}`,
    );
  }

  /* Stale extras are harmless for reads, but they explain a rules test
   * that passes while the app fails (or the other way round). */
  const derivedKeys = new Set(
    derived.map((grant) =>
      grantKey(grant.permission, grant.scope_type, grant.scope_id),
    ),
  );

  const extra = actual.filter(
    (grant) =>
      grant.allowed &&
      !derivedKeys.has(
        grantKey(grant.permission, grant.scope_type, grant.scope_id),
      ),
  );

  console.log(`\nACTUAL BUT NOT DERIVED: ${extra.length}`);
  for (const grant of extra.slice(0, 8)) {
    console.log(
      `  extra ${grant.permission} @ ${grant.scope_type}:${grant.scope_id}`,
    );
  }

  const rulesGrants = actualGrantSet(actual);

  /* ---------------------------------------------------------- */
  const level =
    positionScopeLevel(authority.position) ??
    (assignments[0]?.scope_type as ScopeType | undefined);

  const scopeId = authority.scopeId ?? assignments[0]?.scope_id ?? "";

  const scope =
    level && scopeId
      ? await resolveCampaignScope(level, scopeId, lgas)
      : null;

  sub("5. RESOLVED PAGE SCOPE");
  console.log(
    scope
      ? JSON.stringify(
          {
            level: scope.level,
            scope_id: scope.scope_id,
            label: scope.label,
            lgaIds: scope.lgaIds,
            wardCount: scope.wardIds.length,
            pollingUnitCount: scope.pollingUnitIds.length,
          },
          null,
          2,
        )
      : "<unresolved — every campaign page renders the empty state>",
  );

  if (!scope) {
    process.exit(0);
  }

  /* ---------------------------------------------------------- */
  if (verify) {
    printVerification(uid, scope, derived);
    return;
  }

  /* ---------------------------------------------------------- */
  sub("6. QUERY PLAN (from grantScopes -> groupScopeQueries)");

  const allPlans: PlannedQuery[][] = [];

  for (const plan of COLLECTION_PLANS) {
    const queries = planQueries(plan.collection, scope, derived);
    allPlans.push(queries);

    console.log(`\n${plan.collection}: ${queries.length} queries`);

    for (const query of queries) {
      console.log(`  ${JSON.stringify(query.filter)}`);
    }

    if (plan.collection === "campaign_field_reports") {
      console.log(
        `  (identity only) where submitted_by == "${uid}" ` +
          `— 1 query`,
      );
      console.log(
        `  (identity only) where assignment_creator_id == "${uid}" ` +
          `— 1 query`,
      );
    }
  }

  /* ---------------------------------------------------------- */
  /*
   * Candidate documents. A query can only return a document whose
   * indexed field matches, so the candidate set is the union of the
   * scope ids in play plus the stamped fields in play. This is a
   * superset of what the resolver would receive — deliberately, so a
   * failure cannot hide behind a chunking boundary.
   */
  const scopeIds = Array.from(
    new Set([
      scope.scope_id,
      ...(scope.wardIds ?? []),
      ...(scope.lgaIds ?? []),
      ...(scope.pollingUnitIds ?? []),
    ]),
  );

  const wardIds = scope.wardIds ?? [];

  async function fetchBy(
    collection: string,
    field: string,
    ids: string[],
  ): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
    const found = new Map<string, Record<string, unknown>>();

    for (const chunk of chunkIds(ids)) {
      if (chunk.length === 0) continue;

      const snapshot = await db
        .collection(collection)
        .where(field, "in", chunk)
        .get();

      for (const item of snapshot.docs) {
        found.set(item.id, item.data() as Record<string, unknown>);
      }
    }

    return Array.from(found.entries()).map(([id, data]) => ({ id, data }));
  }

  sub("7. DOCUMENT-LEVEL RULE EVALUATION");

  for (const plan of COLLECTION_PLANS) {
    const scanned = new Map<string, Record<string, unknown>>();

    for (const item of await fetchBy(plan.collection, "scope_id", scopeIds)) {
      scanned.set(item.id, item.data);
    }

    if (plan.stampField) {
      for (const item of await fetchBy(
        plan.collection,
        plan.stampField,
        wardIds,
      )) {
        scanned.set(item.id, item.data);
      }
    }

    const docs = Array.from(scanned.entries()).map(([id, data]) => ({
      id,
      data,
    }));

    const queries = planQueries(plan.collection, scope, derived);

    console.log(
      `\n${plan.collection}: ${docs.length} candidate documents in the page's area`,
    );

    let passed = 0;
    let failed = 0;
    let missingStamp = 0;

    const failures: Array<{
      id: string;
      data: Record<string, unknown>;
      verdict: Verdict;
      query: string;
    }> = [];

    for (const doc of docs) {
      if (plan.stampField && isBlank(doc.data[plan.stampField])) {
        missingStamp++;
      }

      const verdict = evaluateDoc(
        plan.collection,
        doc.data,
        uid,
        rulesGrants,
      );

      if (verdict.pass) {
        passed++;
        continue;
      }

      failed++;

      /* Which planned query returns it? A failure only breaks the page
       * when a query would actually return the document. */
      const matching = queries.find((query) => query.matches(doc.data));

      failures.push({
        id: doc.id,
        data: doc.data,
        verdict,
        query: matching
          ? JSON.stringify(matching.filter)
          : "<not returned by any planned query>",
      });
    }

    console.log(
      `  PASS ${passed} | FAIL ${failed} | missing ${plan.stampField ?? "n/a"}: ${missingStamp}`,
    );

    for (const failure of failures.slice(0, 5)) {
      console.log(
        `\n  FAIL ${failure.id}\n` +
          `    scope_type=${show(failure.data.scope_type)} ` +
          `scope_id=${show(failure.data.scope_id)} ` +
          `scope_ward_id=${show(failure.data.scope_ward_id)} ` +
          `target_ward_id=${show(failure.data.target_ward_id)} ` +
          `assignment_creator_id=${show(failure.data.assignment_creator_id)}\n` +
          `    rule: ${failure.verdict.clause}\n` +
          `    query: ${failure.query}`,
      );
    }

    /* The decisive number: a query fails if ANY returned doc fails. */
    const brokenQueries = new Map<string, number>();

    for (const failure of failures) {
      brokenQueries.set(
        failure.query,
        (brokenQueries.get(failure.query) ?? 0) + 1,
      );
    }

    if (brokenQueries.size > 0) {
      console.log(`\n  QUERIES THAT WILL BE DENIED (any failing doc):`);

      for (const [query, count] of brokenQueries) {
        console.log(`    ${query}  -> ${count} failing doc(s)`);
      }
    } else {
      console.log(
        `  every document returned by this plan passes the rules`,
      );
    }
  }

  /* ---------------------------------------------------------- */
  sub("8. SUMMARY");

  console.log(
    `derived grants=${derived.length} actual=${actual.length} ` +
      `missing=${missing.length} extra=${extra.length}`,
  );

  const uniqueScopes = new Set(
    derived
      .filter((grant) => grant.scope_type !== "global")
      .map((grant) => grantKey(grant.permission, grant.scope_type, grant.scope_id)),
  );

  console.log(`distinct derived grant keys: ${uniqueScopes.size}`);

  const planCount = allPlans.reduce((total, list) => total + list.length, 0);

  console.log(
    `total scoped queries the resolver fires (excluding the 2 report identity queries): ${planCount}`,
  );

  const projectionPerms = new Set(
    Object.values(CAMPAIGN_PROJECTION_PERMISSIONS).flat(),
  );

  console.log(
    `projection permission catalogue size: ${projectionPerms.size}`,
  );

  void scopeKey;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
