/*
 * Read-only reproduction of the instrumented [election-read] console
 * line for the ward-scoped results query, using the Admin SDK (which
 * bypasses rules, so the failure can only be a missing index).
 *
 * Run: npx tsx scripts/probe-election-read.ts
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import * as fs from "fs";
import * as path from "path";

import {
  electionRead,
} from "../src/lib/firebase/query-debug";

async function main() {
  const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");
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
    "round10-election-read-probe",
  );

  const db = getFirestore(app);

  await electionRead(
    { collection: "election_results", filter: { ward_id: "nkanu-west-ward-01" } },
    () =>
      db
        .collection("election_results")
        .where("ward_id", "==", "nkanu-west-ward-01")
        .orderBy("created_at", "desc")
        .get()
        .then((snap) => snap.size),
  ).catch(() => undefined);

  process.exit(0);
}

main();
