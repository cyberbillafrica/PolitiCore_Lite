/*
 * ============================================================
 * ROUND 16A — BACKFILL `result_level` ON LEGACY RESULTS
 * ============================================================
 *
 * Before this round every `election_results` document was a polling
 * unit result and carried no `result_level`. Client code treats a
 * missing field as "polling_unit", so the backfill is not required for
 * reads or reviews — it makes the stored data explicit before Round B
 * compares ward totals against the sum of polling-unit results.
 *
 * USAGE
 * -----
 *   npx tsx scripts/backfill-result-level.ts --dry-run
 *   npx tsx scripts/backfill-result-level.ts --apply
 *
 * Default is --dry-run. The script is idempotent: a document that
 * already has result_level is never selected or rewritten.
 *
 * The agent must NOT run --apply; the operator runs it after deploy.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import * as fs from "fs";
import * as path from "path";

const BATCH_SIZE = 400;

export interface ResultLevelCandidate {
  id: string;
  result_level?: unknown;
}

/**
 * Pure planner: ids of documents that still need the legacy default.
 * A blank string is treated like a missing field.
 */
export function planResultLevelBackfill(
  docs: ResultLevelCandidate[],
): string[] {
  return docs
    .filter((doc) => {
      const value = doc.result_level;
      return value === undefined || value === null || value === "";
    })
    .map((doc) => doc.id);
}

function connectAdmin() {
  const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      "serviceAccountKey.json not found at the project root. The backfill needs the Admin SDK.",
    );
  }

  const raw = fs.readFileSync(serviceAccountPath, "utf8");
  const serviceAccount = JSON.parse(raw) as { project_id?: string };

  const app = initializeApp(
    {
      credential: cert(JSON.parse(raw) as Parameters<typeof cert>[0]),
      projectId: serviceAccount.project_id,
    },
    "backfill-result-level",
  );

  return { db: getFirestore(app), projectId: serviceAccount.project_id };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { db, projectId } = connectAdmin();

  console.log(`Round 16A — result_level backfill (project: ${projectId})`);
  console.log(`mode: ${apply ? "APPLY" : "DRY RUN"}`);

  const snapshot = await db.collection("election_results").get();
  const docs: ResultLevelCandidate[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    result_level: doc.data().result_level,
  }));

  const targets = planResultLevelBackfill(docs);

  console.log(`documents scanned: ${docs.length}`);
  console.log(`missing result_level: ${targets.length}`);

  if (targets.length === 0) {
    console.log("Nothing to do — every document already has result_level.");
    process.exit(0);
  }

  if (!apply) {
    console.log("Would update:");
    for (const id of targets.slice(0, 50)) console.log(`  - ${id}`);
    if (targets.length > 50) {
      console.log(`  … and ${targets.length - 50} more`);
    }
    console.log("Dry run — no documents written.");
    process.exit(0);
  }

  let updated = 0;
  for (let index = 0; index < targets.length; index += BATCH_SIZE) {
    const chunk = targets.slice(index, index + BATCH_SIZE);
    const batch = db.batch();

    for (const id of chunk) {
      batch.update(db.collection("election_results").doc(id), {
        result_level: "polling_unit",
      });
    }

    await batch.commit();
    updated += chunk.length;
    console.log(`updated ${updated}/${targets.length}`);
  }

  console.log(`Done — ${updated} document(s) now have result_level.`);
  process.exit(0);
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entry.endsWith("/scripts/backfill-result-level.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
