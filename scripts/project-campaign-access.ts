/*
 * ============================================================
 * ONE-OFF: PROJECT THE CAMPAIGN BASELINE
 * ============================================================
 *
 *   npm run project:campaign-access               apply
 *   npm run project:campaign-access -- --dry-run  report only
 *
 * Ensures every ELIGIBLE campaign member holds the baseline
 * `user_access` documents for their own registered area, so the campaign
 * pages stop failing with "Missing or insufficient permissions" and the
 * summary spinners stop hanging on reads that never resolve.
 *
 * Eligibility (docs/campaign-member-baseline.md):
 *
 *   membership_types includes "campaign_member"
 *   access_role !== "election_officer"
 *   non-empty polling_unit_id, ward_id and lga_id
 *
 * Coordinators ARE eligible: the baseline is additive on top of their
 * coordinator grants, and it is what gives them view_activities at their
 * LGA, zone and state.
 *
 * An ineligible user has every campaign document removed (the election
 * projection is preserved), because they are entitled to none.
 *
 * Idempotent: a second run reports zero changes.
 */

import {
  applyBaselinePlan,
  connectAdmin,
  loadActualAccessDocs,
  loadUsers,
  planBaseline,
} from "./lib/campaign-access-admin";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { db, projectId } = connectAdmin();

  console.log(
    `Connected to ${projectId}.${dryRun ? " DRY RUN — nothing will be written." : ""}`,
  );

  const users = await loadUsers(db);

  console.log(`Scanning ${users.length} users...\n`);

  const skipped: Record<string, number> = {};
  let written = 0;
  let deleted = 0;
  let alreadyCorrect = 0;

  for (const user of users) {
    const actual = await loadActualAccessDocs(db, user.uid);
    const plan = planBaseline({ user, actual });

    if (plan.skipped) {
      skipped[plan.skipped] = (skipped[plan.skipped] ?? 0) + 1;
    }

    if (plan.toAdd.length === 0 && plan.toDelete.length === 0) {
      if (!plan.skipped) alreadyCorrect++;
      continue;
    }

    const applied = await applyBaselinePlan(db, plan, { dryRun });

    written += applied.written;
    deleted += applied.deleted;

    console.log(
      `${user.uid}  ${user.name}\n  baseline written: ${applied.written}  removed: ${applied.deleted}  baseline size: ${plan.baseline.length}`,
    );
  }

  console.log("\n================ SUMMARY ================");
  console.log(`users scanned ......... ${users.length}`);
  console.log(`baseline docs written . ${written}`);
  console.log(`already correct ....... ${alreadyCorrect}`);
  console.log(`docs removed .......... ${deleted}`);
  console.log(`dry run ............... ${dryRun ? "yes" : "no"}`);

  const skipEntries = Object.entries(skipped);
  if (skipEntries.length > 0) {
    console.log(
      `skipped: ${skipEntries
        .map(([reason, count]) => `${reason}=${count}`)
        .join(", ")}`,
    );
  }

  console.log(
    "\nRun `npm run verify:campaign-access` to read the baseline back and assert it.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("project-campaign-access failed:", error);
    process.exit(1);
  });
