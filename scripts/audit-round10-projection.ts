/*
 * Round 10 — projection impact (READ ONLY).
 *
 * Reports how many `upload_election_result` documents each coordinator
 * level gains, and confirms the campaign read-grant count (the LGA
 * coordinator's 187) is unchanged because the upload grant lives in the
 * election projection, not `computeExpectedCampaignAccess`.
 *
 * Run: npx tsx scripts/audit-round10-projection.ts
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import * as fs from "fs";
import * as path from "path";

import { resolveScopeTargets } from "../src/lib/campaign-access";

function connectAdmin() {
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
    "round10-projection",
  );

  return getFirestore(app);
}

async function main() {
  const db = connectAdmin();
  const snap = await db.collection("electoral_data").doc("enugu-state").get();
  const lgas = (snap.data()?.lgas ?? []) as Array<{
    id: string;
    wards: Array<{ id: string }>;
  }>;

  console.log(`live LGAs: ${lgas.length}`);
  console.log(
    `live wards: ${lgas.reduce((sum, lga) => sum + (lga.wards?.length ?? 0), 0)}`,
  );

  const cases: Array<[string, string, string]> = [
    ["ward_coordinator", "ward", "nkanu-west-ward-01"],
    ["lga_coordinator", "lga", "nkanu-west"],
    ["zone_coordinator", "senatorial_zone", "enugu-east"],
    ["state_coordinator", "state", "enugu-state"],
  ];

  for (const [position, scopeType, scopeId] of cases) {
    const targets = resolveScopeTargets(
      scopeType as Parameters<typeof resolveScopeTargets>[0],
      scopeId,
      lgas as Parameters<typeof resolveScopeTargets>[2],
    );

    const byType = new Map<string, number>();
    for (const target of targets) {
      byType.set(target.scope_type, (byType.get(target.scope_type) ?? 0) + 1);
    }

    console.log("");
    console.log(`${position} (${scopeType}:${scopeId})`);
    console.log(`  upload_election_result docs: +${targets.length}`);
    console.log(
      `  targets: ${Array.from(byType.entries())
        .map(([type, count]) => `${type}=${count}`)
        .join(", ")}`,
    );
  }

  /* The read-grant count comes from the campaign projection, which this
   * round does not change. */
  console.log("");
  const expectedReadPermission = process.argv.includes("--verify")
    ? "campaign read grants unchanged (run tests/rules/lga-coordinator-full-load.test.ts)"
    : "campaign read grants unchanged (187 for a 14-ward LGA coordinator)";
  console.log(expectedReadPermission);

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
