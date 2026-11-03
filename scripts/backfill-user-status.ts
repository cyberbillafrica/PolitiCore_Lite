/*
 * ============================================================
 * ROUND 17 — BACKFILL `status` ON LEGACY USER PROFILES
 * ============================================================
 *
 * Round 17 gates the portal on `users/{uid}.status`:
 *
 *   absent      → ACTIVE (legacy behaviour, still honoured by every reader)
 *   "active"    → allowed
 *   "pending"   → awaiting admin approval, blocked
 *   "rejected"  → declined, blocked
 *   "suspended" → blocked by an admin
 *
 * Because an absent field already counts as active, the app works before
 * this script runs. The backfill makes the stored data EXPLICIT so a
 * later read can never confuse "never reviewed" with "approved".
 *
 * Only documents with a missing / null / blank status are selected.
 * `active`, `pending`, `rejected` and `suspended` are never rewritten, so
 * re-running the script is a no-op.
 *
 * USAGE
 * -----
 *   npm run backfill:user-status              (dry run — default)
 *   npm run backfill:user-status -- --apply
 *
 * The agent must NOT run --apply; the operator runs it after the rules
 * are deployed.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import * as fs from "fs";
import * as path from "path";

const BATCH_SIZE = 400;

export interface UserStatusCandidate {
  id: string;
  status?: unknown;
}

/**
 * Pure planner: ids of profiles whose status is missing, null or blank.
 *
 * Every other value — including an already-explicit "active" — is left
 * alone, which is what makes the script idempotent.
 */
export function planUserStatusBackfill(
  docs: UserStatusCandidate[],
): string[] {
  return docs
    .filter((doc) => {
      const value = doc.status;

      if (value === undefined || value === null) return true;

      return typeof value === "string" && value.trim() === "";
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
    "backfill-user-status",
  );

  return { db: getFirestore(app), projectId: serviceAccount.project_id };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { db, projectId } = connectAdmin();

  console.log(`Round 17 — user status backfill (project: ${projectId})`);
  console.log(`mode: ${apply ? "APPLY" : "DRY RUN"}`);

  const snapshot = await db.collection("users").get();

  const docs: UserStatusCandidate[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    status: doc.data().status,
  }));

  const targets = planUserStatusBackfill(docs);

  console.log(`documents scanned: ${docs.length}`);
  console.log(`missing status: ${targets.length}`);

  if (targets.length === 0) {
    console.log("Nothing to do — every profile already has a status.");
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
      batch.update(db.collection("users").doc(id), { status: "active" });
    }

    await batch.commit();
    updated += chunk.length;
    console.log(`updated ${updated}/${targets.length}`);
  }

  console.log(`Done — ${updated} profile(s) now have status "active".`);
  process.exit(0);
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entry.endsWith("/scripts/backfill-user-status.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
