/*
 * ============================================================
 * ROUND 10.5 — BACKFILL `upload_election_result` GRANTS
 * ============================================================
 *
 * Round 10 added `upload_election_result` to the election access
 * projection so a coordinator may submit a result for any polling
 * unit inside their assignment. Assignments projected by Round 9.5
 * carried only `view_election_results`, so their coordinators are
 * still denied outside their own registered polling unit.
 *
 * This script re-projects every ACTIVE upload-scope assignment:
 *
 *   ward_coordinator, lga_coordinator, zone_coordinator,
 *   state_coordinator, campaign_manager, council_chairman
 *
 * It writes the same document set
 * `syncElectionResultAccessForAssignment()` writes — the read grants
 * (polling units included for an LGA, exactly as `electionAccessDocs()`
 * expands them) plus the upload grant at the assignment scope. That
 * means it also repairs an account whose read projection never landed
 * (an active assignment with zero `view_election_results` documents).
 *
 * WHY IT DOES NOT CALL THE FUNCTION DIRECTLY
 * ------------------------------------------
 * `syncElectionResultAccessForAssignment` is exported from
 * `src/lib/firebase/userAccess.ts`, which imports the browser SDK
 * (`src/lib/firebase/config.ts`). In Node that module initialises
 * `firebase/app` from the NEXT_PUBLIC_* fallbacks — project
 * "demo-app" — and would write through an unauthenticated client that
 * rules reject, silently succeeding while changing nothing.
 *
 * So the plan is computed from the same pure helpers the browser uses
 * (`resolveScopeTargets`, `buildCampaignAccessDocId`, the two
 * permission constants in `src/lib/campaign-access.ts`) and applied
 * with the Admin SDK, which is the pattern
 * `scripts/lib/campaign-access-admin.ts` documents for migrations.
 *
 * USAGE
 * -----
 *   npx tsx scripts/backfill-election-upload-grants.ts --dry-run
 *   npx tsx scripts/backfill-election-upload-grants.ts --apply
 *
 * Default is --dry-run. Reads every assignment and every affected
 * user's existing access documents; writes nothing without --apply.
 *
 * Idempotent: a document already present with `allowed: true` is
 * counted as present and not rewritten, so a second --apply reports
 * zero new grants.
 */

import { FieldValue } from "firebase-admin/firestore";

import {
  ELECTION_RESULTS_PERMISSION,
  ELECTION_UPLOAD_PERMISSION,
  buildCampaignAccessDocId,
  resolveScopeTargets,
  type CampaignAccessDoc,
} from "../src/lib/campaign-access";

import {
  connectAdmin,
  loadActualAccessDocs,
  loadHierarchy,
  loadUsers,
} from "./lib/campaign-access-admin";

import type { LGA, OrganizationalPosition, ScopeType } from "../src/types";

/** Firestore caps a batch at 500 operations. */
const WRITE_CHUNK = 450;

/**
 * The six positions Round 10 grants upload scope to. `pu_coordinator`
 * is deliberately absent: a PU coordinator's own polling unit already
 * comes from `registeredAt()`, so they need no projection.
 */
const UPLOAD_SCOPE_POSITIONS: OrganizationalPosition[] = [
  "ward_coordinator",
  "lga_coordinator",
  "zone_coordinator",
  "state_coordinator",
  "campaign_manager",
  "council_chairman",
];

interface AssignmentRow {
  id: string;
  user_id: string;
  position: string;
  scope_type: string;
  scope_id: string;
  status: string;
}

interface ScopeTarget {
  scope_type: string;
  scope_id: string;
}

/* ============================================================
 * PLAN
 * ============================================================ */

function docFrom(
  userId: string,
  permission: string,
  target: ScopeTarget,
): CampaignAccessDoc {
  return {
    id: buildCampaignAccessDocId(
      userId,
      permission,
      target.scope_type as ScopeType | "global",
      target.scope_id,
    ),
    permission,
    scope_type: target.scope_type as ScopeType | "global",
    scope_id: target.scope_id,
  };
}

function dedupe(docs: CampaignAccessDoc[]): CampaignAccessDoc[] {
  const byId = new Map<string, CampaignAccessDoc>();
  for (const doc of docs) byId.set(doc.id, doc);
  return Array.from(byId.values());
}

/**
 * Mirrors the read half of `electionAccessDocs()`: the campaign
 * projection skips polling units for an LGA, but election results need
 * them because result documents carry no ward stamp the read rule can
 * rely on.
 */
function readPlan(
  userId: string,
  scopeType: ScopeType,
  scopeId: string,
  lgas: LGA[],
): CampaignAccessDoc[] {
  const targets: ScopeTarget[] = [];

  for (const target of resolveScopeTargets(scopeType, scopeId, lgas)) {
    targets.push({
      scope_type: target.scope_type,
      scope_id: target.scope_id,
    });

    if (target.scope_type !== "lga") continue;

    const lga = lgas.find((item) => item.id === target.scope_id);
    if (!lga) continue;

    for (const ward of lga.wards ?? []) {
      for (const unit of ward.pollingUnits ?? []) {
        targets.push({ scope_type: "polling_unit", scope_id: unit.id });
      }
    }
  }

  return dedupe(
    targets.map((target) =>
      docFrom(userId, ELECTION_RESULTS_PERMISSION, target),
    ),
  );
}

/**
 * Upload half: one document per assignment target, never a polling
 * unit fan-out — an LGA assignment costs 15 documents, not ~250.
 */
function uploadPlan(
  userId: string,
  scopeType: ScopeType,
  scopeId: string,
  lgas: LGA[],
): CampaignAccessDoc[] {
  return dedupe(
    resolveScopeTargets(scopeType, scopeId, lgas).map((target) =>
      docFrom(userId, ELECTION_UPLOAD_PERMISSION, {
        scope_type: target.scope_type,
        scope_id: target.scope_id,
      }),
    ),
  );
}

/* ============================================================
 * MAIN
 * ============================================================ */

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run");

  if (apply && dryRun) {
    throw new Error("Pass either --dry-run or --apply, not both.");
  }

  const { db, projectId } = connectAdmin();
  const lgas = await loadHierarchy(db);
  const users = await loadUsers(db);

  const names = new Map(users.map((user) => [user.uid, user.name]));

  console.log("");
  console.log(`Round 10.5 — upload_election_result backfill`);
  console.log(`project: ${projectId}   mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(
    `hierarchy: ${lgas.length} LGAs, ${lgas.reduce(
      (sum, lga) => sum + (lga.wards?.length ?? 0),
      0,
    )} wards`,
  );
  console.log("");

  const snapshot = await db.collection("organizational_assignments").get();

  const assignments: AssignmentRow[] = snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      user_id: String(data.user_id ?? ""),
      position: String(data.position ?? ""),
      scope_type: String(data.scope_type ?? ""),
      scope_id: String(data.scope_id ?? ""),
      status: String(data.status ?? ""),
    };
  });

  const skippedReasons = new Map<string, number>();
  const skip = (reason: string) =>
    skippedReasons.set(reason, (skippedReasons.get(reason) ?? 0) + 1);

  const accessCache = new Map<
    string,
    Awaited<ReturnType<typeof loadActualAccessDocs>>
  >();

  async function actualFor(userId: string) {
    const cached = accessCache.get(userId);
    if (cached) return cached;

    const loaded = await loadActualAccessDocs(db, userId);
    accessCache.set(userId, loaded);
    return loaded;
  }

  interface RowResult {
    row: AssignmentRow;
    reads: CampaignAccessDoc[];
    uploads: CampaignAccessDoc[];
    readsNew: CampaignAccessDoc[];
    uploadsNew: CampaignAccessDoc[];
    readsPresent: number;
    uploadsPresent: number;
    hadNoElectionGrants: boolean;
  }

  const results: RowResult[] = [];

  for (const row of assignments) {
    if (row.status !== "active") {
      skip(`inactive (status=${row.status || "empty"})`);
      continue;
    }

    if (
      !UPLOAD_SCOPE_POSITIONS.includes(row.position as OrganizationalPosition)
    ) {
      skip(`position not in upload scope (${row.position || "empty"})`);
      continue;
    }

    if (!row.user_id) {
      skip("no user");
      continue;
    }

    const scopeType = row.scope_type as ScopeType;
    const targets = resolveScopeTargets(scopeType, row.scope_id, lgas);

    if (targets.length === 0) {
      skip(`no scope (${row.scope_type || "empty"}:${row.scope_id})`);
      continue;
    }

    const reads = readPlan(row.user_id, scopeType, row.scope_id, lgas);
    const uploads = uploadPlan(row.user_id, scopeType, row.scope_id, lgas);

    const actual = await actualFor(row.user_id);
    const actualById = new Map(actual.map((doc) => [doc.id, doc]));
    const isCorrect = (plan: CampaignAccessDoc) => {
      const found = actualById.get(plan.id);
      return Boolean(found && found.allowed === true);
    };

    const readsNew = reads.filter((plan) => !isCorrect(plan));
    const uploadsNew = uploads.filter((plan) => !isCorrect(plan));

    const hadNoElectionGrants = !actual.some(
      (doc) =>
        doc.permission === ELECTION_RESULTS_PERMISSION ||
        doc.permission === ELECTION_UPLOAD_PERMISSION,
    );

    results.push({
      row,
      reads,
      uploads,
      readsNew,
      uploadsNew,
      readsPresent: reads.length - readsNew.length,
      uploadsPresent: uploads.length - uploadsNew.length,
      hadNoElectionGrants,
    });
  }

  /* -------- per-assignment table -------- */

  console.log("ASSIGNMENTS");
  console.log("");

  for (const result of results) {
    const { row } = result;
    const name = names.get(row.user_id) ?? "Unknown member";

    console.log(
      `${row.user_id}  ${name}  ·  ${row.position}  ·  ${row.scope_type}:${row.scope_id}`,
    );
    console.log(
      `    upload grants: ${result.uploads.length} planned` +
        `, ${result.uploadsNew.length} new` +
        `, ${result.uploadsPresent} already present`,
    );
    console.log(
      `    read grants:   ${result.reads.length} planned` +
        `, ${result.readsNew.length} new` +
        `, ${result.readsPresent} already present` +
        (result.hadNoElectionGrants ? "   <-- had zero election grants" : ""),
    );
    console.log("");
  }

  /* -------- accounts that were never projected -------- */

  const unprojected = results.filter((result) => result.hadNoElectionGrants);

  console.log("ACCOUNTS WITH ZERO PRE-EXISTING ELECTION GRANTS");
  console.log("");

  if (unprojected.length === 0) {
    console.log("  (none)");
  } else {
    for (const result of unprojected) {
      const { row } = result;
      console.log(
        `  ${row.user_id}  ${names.get(row.user_id) ?? "Unknown member"}` +
          `  ·  ${row.position} @ ${row.scope_type}:${row.scope_id}` +
          `  ->  +${result.readsNew.length} read, +${result.uploadsNew.length} upload`,
      );
    }
  }

  console.log("");

  /* -------- apply -------- */

  const uploadTotals = new Map<string, number>();
  const readTotals = new Map<string, number>();

  for (const result of results) {
    uploadTotals.set(
      result.row.position,
      (uploadTotals.get(result.row.position) ?? 0) +
        result.uploadsNew.length,
    );
    readTotals.set(
      result.row.position,
      (readTotals.get(result.row.position) ?? 0) + result.readsNew.length,
    );
  }

  const writes = results.flatMap((result) => [
    ...result.readsNew.map((doc) => ({ userId: result.row.user_id, doc })),
    ...result.uploadsNew.map((doc) => ({ userId: result.row.user_id, doc })),
  ]);

  if (apply && writes.length > 0) {
    for (let index = 0; index < writes.length; index += WRITE_CHUNK) {
      const chunk = writes.slice(index, index + WRITE_CHUNK);
      const batch = db.batch();

      for (const write of chunk) {
        batch.set(
          db.collection("user_access").doc(write.doc.id),
          {
            user_id: write.userId,
            permission: write.doc.permission,
            allowed: true,
            scope_type: write.doc.scope_type,
            scope_id: write.doc.scope_id,
            updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      await batch.commit();
    }
  }

  /* -------- summary -------- */

  const totalSkipped = Array.from(skippedReasons.values()).reduce(
    (sum, count) => sum + count,
    0,
  );
  const totalNewUploads = results.reduce(
    (sum, result) => sum + result.uploadsNew.length,
    0,
  );
  const totalNewReads = results.reduce(
    (sum, result) => sum + result.readsNew.length,
    0,
  );

  console.log("SUMMARY");
  console.log("");
  console.log(`  assignments scanned:  ${assignments.length}`);
  console.log(`  active in scope:      ${results.length}`);
  console.log(`  skipped:              ${totalSkipped}`);
  for (const [reason, count] of skippedReasons) {
    console.log(`      ${count} x ${reason}`);
  }
  console.log("");
  console.log(`  upload grants new:    ${totalNewUploads}`);
  for (const [position, count] of uploadTotals) {
    if (count > 0) console.log(`      ${position}: +${count}`);
  }
  console.log(`  read grants new:      ${totalNewReads}`);
  for (const [position, count] of readTotals) {
    if (count > 0) console.log(`      ${position}: +${count}`);
  }
  console.log("");
  console.log(
    apply
      ? `  written:              ${writes.length} user_access documents`
      : `  would write:          ${writes.length} user_access documents (dry run — nothing written)`,
  );

  if (!apply) {
    console.log("");
    console.log("  Re-run with --apply to write these grants.");
  }

  console.log("");

  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
