/*
 * ============================================================
 * BOOTSTRAP VERIFIER — CHECK THE BASELINE EXISTS
 * ============================================================
 *
 * Run after `npm run bootstrap`. Reads every baseline document the
 * app needs and reports per-document PASS/FAIL, then exits 0 only
 * when all baseline documents exist with the expected shape.
 *
 * Usage:
 *   npm run bootstrap:verify
 *
 * Requires serviceAccountKey.json at the project root and
 * NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local.
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

interface Expected {
  collection: string;
  docId: string;
  check: (data: Record<string, unknown> | undefined) => boolean;
  description: string;
}

async function main(): Promise<void> {
  const {
    INEC_2027_POLITICAL_PARTIES,
    DEFAULT_ELECTION_CYCLE_2027,
    DEFAULT_CONTESTS_2027,
  } = await import("../src/lib/firebase/election-seed");

  const expected: Expected[] = [
    {
      collection: "electoral_data",
      docId: "enugu-state",
      description: "electoral hierarchy present",
      check: (d) =>
        !!d &&
        Array.isArray(d.lgas) &&
        (d.lgas as unknown[]).length > 0,
    },
    {
      collection: "election_settings",
      docId: "default",
      description: "settings doc with election_mode_enabled",
      check: (d) =>
        !!d && d.election_mode_enabled === true && "active_contest_id" in d,
    },
    {
      collection: "election_cycles",
      docId: DEFAULT_ELECTION_CYCLE_2027.id,
      description: "seeded election cycle",
      check: (d) => !!d && d.name === DEFAULT_ELECTION_CYCLE_2027.name,
    },
    ...DEFAULT_CONTESTS_2027.map((c) => ({
      collection: "election_contests",
      docId: c.id,
      description: `contest "${c.name}"`,
      check: (d: Record<string, unknown> | undefined) =>
        !!d && d.scope_type === c.scope_type && d.status === c.status,
    })),
    ...INEC_2027_POLITICAL_PARTIES.map((p) => ({
      collection: "political_parties",
      docId: p.id,
      description: `party "${p.acronym}"`,
      check: (d: Record<string, unknown> | undefined) =>
        !!d && d.acronym === p.acronym,
    })),
  ];

  const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      "serviceAccountKey.json not found at the project root.",
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

  console.log(`Verifying baseline on project ${serviceAccount.project_id}...`);

  let pass = 0;
  let fail = 0;

  for (const exp of expected) {
    const snap = await adb.collection(exp.collection).doc(exp.docId).get();

    if (snap.exists && exp.check(snap.data() as Record<string, unknown>)) {
      pass += 1;
      console.log(`  PASS  ${exp.collection}/${exp.docId} — ${exp.description}`);
    } else {
      fail += 1;
      console.log(`  FAIL  ${exp.collection}/${exp.docId} — ${exp.description}`);
    }
  }

  await admin.deleteApp(app);

  console.log(`\n${pass} passed, ${fail} failed.`);

  if (fail > 0) {
    throw new Error(
      "Bootstrap verification failed — run `npm run bootstrap` and re-verify.",
    );
  }
}

main()
  .then(() => {
    console.log("Verification finished.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Verification error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
