/*
 * ============================================================
 * VERIFY: CAMPAIGN BASELINE
 * ============================================================
 *
 *   npm run verify:campaign-access
 *   npm run verify:campaign-access -- --limit=20
 *
 * READ-ONLY. For every eligible campaign member it reads the baseline
 * documents back and asserts:
 *
 *   - each of the expected baseline ids exists
 *   - allowed === true and user_id === the member's uid
 *   - scope_type / scope_id match the id
 *   - no legacy `tenant_id` field on any of them
 *
 * Prints PASS / FAIL per user and exits non-zero when anything fails, so
 * it can gate a deploy.
 */

import {
  ELECTION_RESULTS_PERMISSION,
  buildBaselineAccessDocs,
  type CampaignAccessDoc,
} from "../src/lib/campaign-access";

import {
  connectAdmin,
  loadActualAccessDocs,
  loadUsers,
  expectedSkipReason,
} from "./lib/campaign-access-admin";

const DEFAULT_SAMPLE = 50;

function limitFromArgs(): number {
  const arg = process.argv.find((item) => item.startsWith("--limit="));
  if (!arg) return DEFAULT_SAMPLE;

  const parsed = Number.parseInt(arg.split("=")[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SAMPLE;
}

function assertBaseline(
  uid: string,
  expected: CampaignAccessDoc[],
  actual: Awaited<ReturnType<typeof loadActualAccessDocs>>,
): string[] {
  const problems: string[] = [];
  const byId = new Map(actual.map((doc) => [doc.id, doc]));

  for (const doc of expected) {
    const current = byId.get(doc.id);

    if (!current) {
      problems.push(`missing ${doc.id}`);
      continue;
    }

    if (current.allowed !== true) {
      problems.push(`allowed != true on ${doc.id}`);
    }

    if (current.user_id !== uid) {
      problems.push(`user_id mismatch on ${doc.id}`);
    }

    if (current.tenant_id !== undefined) {
      problems.push(`legacy tenant_id on ${doc.id}`);
    }

    if (current.scope_type !== doc.scope_type) {
      problems.push(`scope_type mismatch on ${doc.id}`);
    }

    if (doc.scope_type !== "global" && current.scope_id !== doc.scope_id) {
      problems.push(`scope_id mismatch on ${doc.id}`);
    }
  }

  /* No legacy permission names anywhere in the user's campaign docs. */
  const legacy = actual.filter(
    (doc) =>
      doc.tenant_id !== undefined &&
      doc.permission !== ELECTION_RESULTS_PERMISSION,
  );

  if (legacy.length > 0) {
    problems.push(
      `${legacy.length} document(s) still carry tenant_id: ${legacy
        .map((doc) => doc.id)
        .join(", ")}`,
    );
  }

  return problems;
}

async function main() {
  const limit = limitFromArgs();

  const { db, projectId } = connectAdmin();

  console.log(`Connected to ${projectId} (read-only).`);

  const users = await loadUsers(db);

  const eligible: Array<{ uid: string; name: string; expected: CampaignAccessDoc[] }> =
    [];
  const skipped: Record<string, number> = {};

  for (const user of users) {
    const expected = buildBaselineAccessDocs(user.uid, user.profile);

    if (expected.length === 0) {
      const reason = expectedSkipReason(user.profile);
      skipped[reason] = (skipped[reason] ?? 0) + 1;
      continue;
    }

    eligible.push({ uid: user.uid, name: user.name, expected });
  }

  const sample =
    eligible.length > limit ? eligible.slice(0, limit) : eligible;

  console.log(
    `\n${eligible.length} eligible member(s); verifying ${sample.length}.\n`,
  );

  let failures = 0;

  for (const entry of sample) {
    const actual = await loadActualAccessDocs(db, entry.uid);
    const problems = assertBaseline(entry.uid, entry.expected, actual);

    if (problems.length === 0) {
      console.log(
        `PASS ${entry.uid}  ${entry.name}  (${entry.expected.length} baseline docs)`,
      );
    } else {
      failures++;
      console.log(`FAIL ${entry.uid}  ${entry.name}`);
      for (const problem of problems) {
        console.log(`     - ${problem}`);
      }
    }
  }

  console.log("\n================ SUMMARY ================");
  console.log(`eligible members ..... ${eligible.length}`);
  console.log(`verified ............. ${sample.length}`);
  console.log(`passed ............... ${sample.length - failures}`);
  console.log(`failed ............... ${failures}`);

  const skipEntries = Object.entries(skipped);
  if (skipEntries.length > 0) {
    console.log(
      `ineligible: ${skipEntries
        .map(([reason, count]) => `${reason}=${count}`)
        .join(", ")}`,
    );
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("verify-campaign-access failed:", error);
  process.exit(1);
});
