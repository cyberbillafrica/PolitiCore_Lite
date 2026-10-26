/*
 * ============================================================
 * ROUND 10 AUDIT — READ ONLY
 * ============================================================
 *
 * Answers the Phase A questions that need server-side state:
 *
 *   1. The stored shape of the result doc the operator inspected
 *      (party field casing vs. tracked_parties).
 *   2. Whether the composite query the results page fires for a
 *      ward coordinator (ward_id ==, orderBy created_at) can run
 *      at all — a missing index fails with `failed-precondition`,
 *      which the UI maps to "This action can't be completed right
 *      now. Please refresh the page and try again."
 *   3. The ward coordinator's `user_access` grants for
 *      view_election_results, and whether the four results in the
 *      ward actually exist.
 *
 * Run: npx tsx scripts/audit-round10.ts
 *
 * It never writes. Nothing is deployed or migrated.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import * as fs from "fs";
import * as path from "path";

function connectAdmin(): Firestore {
  const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error("serviceAccountKey.json not found at the project root.");
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
    "round10-audit",
  );

  return getFirestore(app);
}

const TARGET_PU = "nkanu-west-ward-02-pu-016";
const TARGET_WARD = "nkanu-west-ward-02";

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object" && "toDate" in (value as object)) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      /* fall through */
    }
  }
  return JSON.stringify(value);
}

async function main() {
  const db = connectAdmin();

  console.log("=".repeat(72));
  console.log("A.1 — RESULT DOCUMENT AND PARTY FIELD SHAPE");
  console.log("=".repeat(72));

  const byPu = await db
    .collection("election_results")
    .where("polling_unit_id", "==", TARGET_PU)
    .get();

  console.log(`election_results where polling_unit_id == ${TARGET_PU}`);
  console.log(`documents: ${byPu.size}`);

  for (const docSnap of byPu.docs) {
    const data = docSnap.data();

    console.log("");
    console.log(`doc id:        ${docSnap.id}`);
    console.log(`contest_id:    ${fmt(data.contest_id)}`);
    console.log(`ward_id:       ${fmt(data.ward_id)}`);
    console.log(`lga_id:        ${fmt(data.lga_id)}`);
    console.log(`status:        ${fmt(data.status)}`);
    console.log(`verified:      ${fmt(data.verified)}`);
    console.log(`submitted_by:  ${fmt(data.submitted_by)}`);
    console.log(`created_at:    ${fmt(data.created_at)}`);
    console.log(
      `results:       ${JSON.stringify(data.results)}`,
    );
    console.log(
      `history:       ${JSON.stringify(data.history ?? null)}`,
    );
    console.log(
      `total votes:   ${(data.results ?? []).reduce(
        (sum: number, row: { votes?: number }) => sum + Number(row.votes ?? 0),
        0,
      )}`,
    );
  }

  console.log("");
  const settingsSnap = await db
    .collection("election_settings")
    .doc("default")
    .get();
  const settings = settingsSnap.data() ?? {};
  const activeContestId = settings.active_contest_id ?? null;

  console.log(`election_settings/default.active_contest_id: ${fmt(activeContestId)}`);
  console.log(`election_settings/default.election_mode_enabled: ${fmt(settings.election_mode_enabled)}`);

  if (activeContestId) {
    const contestSnap = await db
      .collection("election_contests")
      .doc(String(activeContestId))
      .get();

    if (contestSnap.exists) {
      const contest = contestSnap.data() ?? {};
      console.log("");
      console.log(`active contest: ${contestSnap.id}`);
      console.log(`  name:            ${fmt(contest.name)}`);
      console.log(`  scope_type:      ${fmt(contest.scope_type)}`);
      console.log(`  scope_id:        ${fmt(contest.scope_id)}`);
      console.log(`  lga_ids:         ${fmt(contest.lga_ids)}`);
      console.log(`  tracked_parties: ${fmt(contest.tracked_parties)}`);
    } else {
      console.log(`active contest doc ${activeContestId} not found in election_contests`);
    }
  }

  console.log("");
  console.log("=".repeat(72));
  console.log("A.6 — COMPOSITE QUERY THE RESULTS PAGE FIRES FOR A WARD");
  console.log("=".repeat(72));

  const wardQuery = db
    .collection("election_results")
    .where("ward_id", "==", TARGET_WARD)
    .orderBy("created_at", "desc");

  console.log(
    `query: election_results where ward_id == ${TARGET_WARD} orderBy created_at desc`,
  );

  try {
    const snap = await wardQuery.get();
    console.log(`RESULT: succeeded, ${snap.size} document(s) — index present.`);
    for (const docSnap of snap.docs) {
      console.log(
        `  ${docSnap.id}  status=${fmt(docSnap.get("status"))}  submitted_by=${fmt(
          docSnap.get("submitted_by"),
        )}`,
      );
    }
  } catch (error) {
    const err = error as { code?: number | string; message?: string; details?: string };
    console.log("RESULT: FAILED");
    console.log(`  code:    ${fmt(err.code)}`);
    console.log(`  message: ${fmt(err.message)}`);
    console.log(`  details: ${fmt(err.details)}`);
  }

  console.log("");
  const wardNoOrder = await db
    .collection("election_results")
    .where("ward_id", "==", TARGET_WARD)
    .get();

  console.log(
    `control query (no orderBy): ${wardNoOrder.size} document(s) in ${TARGET_WARD}`,
  );  console.log("");
  console.log("=".repeat(72));
  console.log("A.6 — WARD COORDINATOR ASSIGNMENTS AND GRANTS");
  console.log("=".repeat(72));

  const assignments = await db
    .collection("organizational_assignments")
    .where("scope_id", "==", TARGET_WARD)
    .where("status", "==", "active")
    .get();

  console.log(
    `organizational_assignments where scope_id == ${TARGET_WARD}, status == active: ${assignments.size}`,
  );

  const uids = new Set<string>();

  for (const docSnap of assignments.docs) {
    const data = docSnap.data();
    console.log(
      `  ${docSnap.id}  user=${fmt(data.user_id)}  position=${fmt(
        data.position,
      )}  scope_type=${fmt(data.scope_type)}`,
    );
    if (typeof data.user_id === "string") uids.add(data.user_id);
  }

  const allWardCoords = await db
    .collection("organizational_assignments")
    .where("position", "==", "ward_coordinator")
    .get();

  console.log("");
  console.log(
    `organizational_assignments where position == ward_coordinator: ${allWardCoords.size}`,
  );

  for (const docSnap of allWardCoords.docs) {
    const data = docSnap.data();
    console.log(
      `  ${docSnap.id}  user=${fmt(data.user_id)}  status=${fmt(
        data.status,
      )}  scope_type=${fmt(data.scope_type)}  scope_id=${fmt(data.scope_id)}`,
    );
    if (typeof data.user_id === "string") uids.add(data.user_id);
  }

  for (const uid of uids) {
    console.log("");
    console.log(`user_access for ${uid}:`);

    const access = await db
      .collection("user_access")
      .where("user_id", "==", uid)
      .get();

    const resultGrants = access.docs.filter(
      (docSnap) => docSnap.get("permission") === "view_election_results",
    );

    console.log(`  total user_access docs: ${access.size}`);
    console.log(`  view_election_results grants: ${resultGrants.length}`);

    for (const grant of resultGrants) {
      console.log(
        `    scope_type=${fmt(grant.get("scope_type"))}  scope_id=${fmt(
          grant.get("scope_id"),
        )}`,
      );
    }

    const badGrants = resultGrants.filter(
      (grant) =>
        grant.get("scope_type") === "ward" &&
        grant.get("scope_id") !== TARGET_WARD,
    );
    if (badGrants.length > 0) {
      console.log(`  ward grants outside ${TARGET_WARD}: ${badGrants.length}`);
    }
  }

  console.log("");
  const allResultGrants = await db
    .collection("user_access")
    .where("permission", "==", "view_election_results")
    .limit(40)
    .get();

  console.log(
    `user_access where permission == view_election_results (first 40): ${allResultGrants.size}`,
  );
  for (const grant of allResultGrants.docs) {
    console.log(
      `  user=${fmt(grant.get("user_id"))}  scope_type=${fmt(
        grant.get("scope_type"),
      )}  scope_id=${fmt(grant.get("scope_id"))}`,
    );
  }

  console.log("");
  console.log("=".repeat(72));
  console.log("A.6 — THE FOUR RESULTS IN THE WARD (Admin SDK, rules bypassed)");
  console.log("=".repeat(72));

  const wardResults = await db
    .collection("election_results")
    .where("ward_id", "==", TARGET_WARD)
    .get();

  console.log(`ward documents: ${wardResults.size}`);
  for (const docSnap of wardResults.docs) {
    console.log(
      `  ${docSnap.id}  pu=${fmt(docSnap.get("polling_unit_id"))}  status=${fmt(
        docSnap.get("status"),
      )}  submitted_by=${fmt(docSnap.get("submitted_by"))}  created_at=${fmt(
        docSnap.get("created_at"),
      )}`,
    );
  }

  console.log("");
  console.log("results per ward (whole collection):");
  const everyResult = await db.collection("election_results").get();
  const perWard = new Map<string, number>();
  for (const docSnap of everyResult.docs) {
    const ward = String(docSnap.get("ward_id") ?? "<missing>");
    perWard.set(ward, (perWard.get(ward) ?? 0) + 1);
  }
  for (const [ward, count] of Array.from(perWard.entries()).sort()) {
    console.log(`  ${ward}: ${count}`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
