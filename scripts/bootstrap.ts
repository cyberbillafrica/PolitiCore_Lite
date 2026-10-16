/*
 * ============================================================
 * BOOTSTRAP — SEED A FRESH CLIENT FIREBASE PROJECT
 * ============================================================
 *
 * A fresh deployment starts with an EMPTY Firestore. This script
 * writes only the BASELINE documents the app needs to function:
 *
 *   electoral_data/enugu-state        all 17 LGAs, wards, PUs
 *   election_settings/default         mode ON, no active contest
 *   election_cycles/{cycle.id}        seeded cycle(s)
 *   election_contests/{contest.id}    seeded contest(s)
 *   political_parties/{party.id}      the INEC registered parties
 *
 * It seeds NO test data: no users, no results, no incidents, and
 * nothing in election_audit. Election results, reports, incidents
 * and audit rows only ever come from real activity.
 *
 * Running the script twice is safe (idempotent): a baseline doc
 * that already exists is left untouched — this script never
 * overwrites and never duplicates. True deletes (results, audit)
 * are only ever written by the application itself under the
 * append-only audit rules.
 *
 * Usage:
 *   npm run bootstrap
 *
 * Requires (see docs/bootstrap.md):
 *   - serviceAccountKey.json at the project root (Admin SDK)
 *   - NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local (cross-check)
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

interface BaselineDoc {
  collection: string;
  docId: string;
  data: Record<string, unknown>;
}

async function buildBaselineDocs(): Promise<BaselineDoc[]> {
  const { INEC_2027_POLITICAL_PARTIES, DEFAULT_ELECTION_CYCLE_2027, DEFAULT_CONTESTS_2027 } =
    await import("../src/lib/firebase/election-seed");

  const { nkanuWestElectoralData } = await import("../src/data/electoral");

  /* electoral_data/enugu-state — the OFFLINE fallback document.
   * Clients whose client-side hierarchy matters (single-LGA deployments
   * etc.) overwrite this document with scripts/seed-electoral-data.ts;
   * the baseline here keeps the same shape so the app boots with real
   * *structure* (an LGA + wards + PUs) even before that. */
  const bundledLgaId =
    nkanuWestElectoralData[0]?.id.split("-ward-")[0] ?? "nkanu-west";

  const fallbackLga = {
    id: bundledLgaId,
    code: bundledLgaId
      .split("-")
      .map((p) => p.charAt(0).toUpperCase())
      .join(""),
    name: bundledLgaId
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    wards: nkanuWestElectoralData,
  };

  const baseline: BaselineDoc[] = [
    {
      collection: "electoral_data",
      docId: "enugu-state",
      data: {
        state: "Enugu",
        lgas: [fallbackLga],
        bootstrap_generated: true,
        note:
          "Baseline document written by scripts/bootstrap.ts. Run scripts/seed-electoral-data.ts to replace it with the full 17-LGA hierarchy.",
      },
    },
    {
      collection: "election_settings",
      docId: "default",
      data: {
        /* The admin activates a contest from the control centre.
         * With NO active contest every operations window stays
         * closed — a deliberate safe state. */
        election_mode_enabled: true,
        active_election_cycle_id: DEFAULT_ELECTION_CYCLE_2027.id,
        active_contest_id: "",
      },
    },
    {
      collection: "election_cycles",
      docId: DEFAULT_ELECTION_CYCLE_2027.id,
      data: DEFAULT_ELECTION_CYCLE_2027,
    },
  ];

  for (const contest of DEFAULT_CONTESTS_2027) {
    baseline.push({
      collection: "election_contests",
      docId: contest.id,
      data: contest,
    });
  }

  for (const party of INEC_2027_POLITICAL_PARTIES) {
    baseline.push({
      collection: "political_parties",
      docId: party.id,
      data: party as unknown as Record<string, unknown>,
    });
  }

  return baseline;
}

async function main() {
  const baseline = await buildBaselineDocs();

  const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      "serviceAccountKey.json not found at the project root. Cannot bootstrap via the Admin SDK.",
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8"),
  );

  const envProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (envProjectId && serviceAccount.project_id !== envProjectId) {
    throw new Error(
      `Project mismatch: serviceAccountKey.json targets "${serviceAccount.project_id}" but NEXT_PUBLIC_FIREBASE_PROJECT_ID is "${envProjectId}".`,
    );
  }

  const admin = await import("firebase-admin/app");
  const firestore = await import("firebase-admin/firestore");

  const app = admin.initializeApp({
    credential: admin.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  const adb = firestore.getFirestore(app);

  console.log(`Connected to project ${serviceAccount.project_id}.`);
  console.log(`Writing ${baseline.length} baseline documents (create-if-missing)...`);

  let created = 0;
  let skipped = 0;

  for (const doc of baseline) {
    const ref = adb.collection(doc.collection).doc(doc.docId);
    const existing = await ref.get();

    if (existing.exists) {
      skipped += 1;
      console.log(`  SKIP  ${doc.collection}/${doc.docId} (already exists)`);
      continue;
    }

    /* Firestore rejects undefined values — serialise through JSON
     * to strip them out deterministically. */
    const clean = JSON.parse(JSON.stringify(doc.data));
    await ref.set(clean);
    created += 1;
    console.log(`  CREATE ${doc.collection}/${doc.docId}`);
  }

  console.log(`\nBootstrap complete: ${created} created, ${skipped} skipped.`);
  console.log(
    "No active contest was set — activate one in the election control centre.",
  );

  await admin.deleteApp(app);
}
main()
  .then(() => {
    console.log("Bootstrap finished.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Unexpected error in bootstrap:", err);
    process.exit(1);
  });
