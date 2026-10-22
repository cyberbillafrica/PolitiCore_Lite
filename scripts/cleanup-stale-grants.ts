/*
 * ============================================================
 * ONE-OFF: CLEANUP STALE GRANTS
 * ============================================================
 *
 *   npm run cleanup:grants               apply
 *   npm run cleanup:grants -- --dry-run  report only
 *
 * Recomputes the campaign projection for EVERY user from their current
 * state (profile + active organizational assignments) and reconciles
 * Firestore against it:
 *
 *   missing documents ............ written
 *   documents with legacy fields . rewritten (drops `tenant_id`)
 *   documents not expected ....... deleted
 *
 * "Not expected" is exactly what the lifecycle bug produced: grants at a
 * previous position's scope, permissions no longer in the matrix, and
 * documents carrying pre-Supabase `tenant_id` fields.
 *
 * The election projection (`view_election_results`) is never touched.
 *
 * Idempotent: a second run reports zero changes.
 */

import {
  applyPlan,
  connectAdmin,
  loadActiveAssignments,
  loadActualAccessDocs,
  loadHierarchy,
  loadUsers,
  planUser,
} from "./lib/campaign-access-admin";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { db, projectId } = connectAdmin();
  const lgas = await loadHierarchy(db);

  console.log(
    `Connected to ${projectId} (${lgas.length} LGAs).${
      dryRun ? " DRY RUN — nothing will be written." : ""
    }`,
  );

  const users = await loadUsers(db);
  const assignments = await loadActiveAssignments(
    db,
    users.map((user) => user.uid),
  );

  console.log(`Scanning ${users.length} users...\n`);

  let usersChanged = 0;
  let docsWritten = 0;
  let docsDeleted = 0;
  let unchanged = 0;
  const skipped: Record<string, number> = {};

  for (const user of users) {
    const actual = await loadActualAccessDocs(db, user.uid);

    const plan = planUser({
      user,
      assignments: assignments.get(user.uid) ?? [],
      actual,
      lgas,
    });

    const changes =
      plan.toAdd.length + plan.toRewrite.length + plan.toDelete.length;

    if (changes === 0) {
      unchanged++;
      if (plan.skipped) {
        skipped[plan.skipped] = (skipped[plan.skipped] ?? 0) + 1;
      }
      continue;
    }

    const applied = await applyPlan(db, plan, { dryRun });

    usersChanged++;
    docsWritten += applied.written;
    docsDeleted += applied.deleted;

    console.log(
      `${user.uid}  ${user.name}\n  deleted: ${applied.deleted}  added: ${applied.written}  expected total: ${plan.expected.length}`,
    );
  }

  console.log("\n================ SUMMARY ================");
  console.log(`users scanned ....... ${users.length}`);
  console.log(`users changed ....... ${usersChanged}`);
  console.log(`users already ok .... ${unchanged}`);
  console.log(`documents written ... ${docsWritten}`);
  console.log(`documents deleted ... ${docsDeleted}`);
  console.log(`dry run ............. ${dryRun ? "yes" : "no"}`);

  const skipEntries = Object.entries(skipped);
  if (skipEntries.length > 0) {
    console.log(
      `skipped (no grants to compute): ${skipEntries
        .map(([reason, count]) => `${reason}=${count}`)
        .join(", ")}`,
    );
  }

  if (dryRun) {
    console.log("\nRe-run without --dry-run to apply.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("cleanup-stale-grants failed:", error);
    process.exit(1);
  });
