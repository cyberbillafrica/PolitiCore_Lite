/*
 * ============================================================
 * CLONE SMOKE TEST — RUN BEFORE A CLIENT SEES THE APP
 * ============================================================
 *
 * Verifies that a freshly cloned deployment is actually a fresh
 * deployment: the service account matches the client SDK project,
 * bootstrap created the baseline, there is no leftover data from
 * another candidate, branding resolves from env, and no user-facing
 * "Ifeanyi" literal survived outside the branding config.
 *
 * USAGE
 * -----
 *   npm run verify:clone
 *
 * Requires serviceAccountKey.json at the project root and
 * .env.local (or the shell environment) populated from
 * .env.example.
 *
 * Exit code is 0 only when no check reports FAIL. WARN means
 * "review this" and never fails the run.
 *
 * NOTE ON TEST DATA: the source deployment intentionally has real
 * campaign data, so its test-data checks FAIL. Those checks must
 * pass on the clone before content entry.
 */

import * as fs from "fs";
import * as path from "path";

import dotenv from "dotenv";
import type { Firestore } from "firebase-admin/firestore";

import { connectAdmin } from "./lib/campaign-access-admin";

dotenv.config({ path: ".env.local" });

type Status = "PASS" | "FAIL" | "WARN";

interface Row {
  status: Status;
  name: string;
  detail: string;
}

const rows: Row[] = [];

function record(status: Status, name: string, detail = ""): void {
  rows.push({ status, name, detail });
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`  ${status.padEnd(4)}  ${name}${suffix}`);
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/** `users/abc` -> `abc`; missing/blank -> "". */
function envProjectId(): string {
  return (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "").trim();
}

/** Firestore caps `in`/limit reads cheaply; one doc is enough to prove presence. */
async function hasAny(db: Firestore, collection: string): Promise<boolean> {
  const snap = await db.collection(collection).limit(1).get();
  return !snap.empty;
}

async function countUpTo(
  db: Firestore,
  collection: string,
  max: number,
): Promise<number> {
  const snap = await db.collection(collection).limit(max).get();
  return snap.size;
}

/** Recursively list `.ts` / `.tsx` files under a directory. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }

    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
    if (entry.name.includes(".bak-")) continue;

    out.push(full);
  }

  return out;
}

async function main(): Promise<void> {
  console.log("PolitiCore clone verification");
  console.log(`project root: ${process.cwd()}`);

  /*
   * Dynamic imports AFTER dotenv.config(): a static import would
   * evaluate branding.ts before .env.local is loaded and every value
   * would silently fall back to the source defaults.
   */
  const { BRANDING } = await import("../src/config/branding");
  const { CLOUDINARY_FOLDER_PREFIX, cloudinaryFolder } = await import(
    "../src/lib/cloudinary"
  );

  /* ============================================================
   * 1. SERVICE ACCOUNT
   * ============================================================ */

  section("1. Service account");

  const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");
  let serviceAccountProject = "";

  if (!fs.existsSync(serviceAccountPath)) {
    record("FAIL", "serviceAccountKey.json present", "not found at the project root");
  } else {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(serviceAccountPath, "utf8"),
      ) as { project_id?: string };

      serviceAccountProject = parsed.project_id ?? "";

      if (serviceAccountProject) {
        record("PASS", "serviceAccountKey.json parses", `project_id ${serviceAccountProject}`);
      } else {
        record("FAIL", "serviceAccountKey.json parses", "no project_id field");
      }
    } catch (error) {
      record(
        "FAIL",
        "serviceAccountKey.json parses",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const configuredProject = envProjectId();

  if (!configuredProject) {
    record("FAIL", "NEXT_PUBLIC_FIREBASE_PROJECT_ID set", "missing or blank");
  } else if (!serviceAccountProject) {
    record("FAIL", "project ids match", "service account project unknown");
  } else if (configuredProject !== serviceAccountProject) {
    record(
      "FAIL",
      "project ids match",
      `service account ${serviceAccountProject} != env ${configuredProject}`,
    );
  } else {
    record("PASS", "project ids match", configuredProject);
  }

  /* ============================================================
   * 2. BRANDING + CLOUDINARY PREFIX
   * ============================================================ */

  section("2. Branding and Cloudinary prefix");

  const candidate = BRANDING.candidateName.trim();
  const candidateIsSource = /^ifeanyi$/i.test(candidate);

  if (!BRANDING.appName) {
    record("FAIL", "BRANDING.appName resolves", "empty");
  } else if (!candidateIsSource && /ifeanyi/i.test(BRANDING.appName)) {
    record(
      "FAIL",
      "BRANDING.appName resolves",
      `"${BRANDING.appName}" still names Ifeanyi — set NEXT_PUBLIC_BRAND_APP_NAME`,
    );
  } else {
    record("PASS", "BRANDING.appName resolves", `"${BRANDING.appName}"`);
  }

  if (!/^https?:\/\/[^/\s]+/.test(BRANDING.siteUrl)) {
    record("FAIL", "BRANDING.siteUrl resolves", `"${BRANDING.siteUrl}"`);
  } else {
    record("PASS", "BRANDING.siteUrl resolves", BRANDING.siteUrl);
  }

  if (!CLOUDINARY_FOLDER_PREFIX) {
    record("FAIL", "Cloudinary prefix set", "empty");
  } else if (/\s/.test(CLOUDINARY_FOLDER_PREFIX)) {
    record(
      "FAIL",
      "Cloudinary prefix set",
      `"${CLOUDINARY_FOLDER_PREFIX}" contains whitespace`,
    );
  } else if (!candidateIsSource && CLOUDINARY_FOLDER_PREFIX === "ifeanyi-2027") {
    record(
      "FAIL",
      "Cloudinary prefix set",
      `"${CLOUDINARY_FOLDER_PREFIX}" is the source prefix — set NEXT_PUBLIC_CLOUDINARY_FOLDER_PREFIX`,
    );
  } else {
    record("PASS", "Cloudinary prefix set", `"${CLOUDINARY_FOLDER_PREFIX}"`);
  }

  /* ============================================================
   * 3. READ THE BASELINE
   * ============================================================ */

  section("3. Bootstrap baseline");

  let db: Firestore | null = null;

  try {
    db = connectAdmin().db;
    record("PASS", "Admin SDK connected", `project ${serviceAccountProject || "unknown"}`);
  } catch (error) {
    record(
      "FAIL",
      "Admin SDK connected",
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!db) {
    finish();
    return;
  }

  /* electoral_data/enugu-state */
  try {
    const snap = await db.doc("electoral_data/enugu-state").get();
    const data = snap.data() as { lgas?: unknown } | undefined;
    const lgaCount = Array.isArray(data?.lgas) ? data.lgas.length : 0;

    if (!snap.exists) {
      record("FAIL", "electoral_data/enugu-state", "missing — run npm run bootstrap");
    } else if (lgaCount === 0) {
      record("FAIL", "electoral_data/enugu-state", "exists but has no LGAs");
    } else if (lgaCount < 17) {
      record(
        "WARN",
        "electoral_data/enugu-state",
        `${lgaCount} LGA(s) — bootstrap fallback only; run npx tsx scripts/seed-electoral-data.ts (or seed the client's own state)`,
      );
    } else {
      record("PASS", "electoral_data/enugu-state", `${lgaCount} LGAs`);
    }
  } catch (error) {
    record("FAIL", "electoral_data/enugu-state", error instanceof Error ? error.message : String(error));
  }

  /* political_parties */
  try {
    const parties = await db.collection("political_parties").limit(1).get();

    if (parties.empty) {
      record("FAIL", "political_parties seeded", "collection is empty");
    } else {
      record("PASS", "political_parties seeded", "at least one party");
    }
  } catch (error) {
    record("FAIL", "political_parties seeded", error instanceof Error ? error.message : String(error));
  }

  /* election_settings/default */
  try {
    const snap = await db.doc("election_settings/default").get();
    const data = snap.data() as
      | { election_mode_enabled?: boolean; active_contest_id?: string }
      | undefined;

    if (!snap.exists) {
      record("FAIL", "election_settings/default", "missing — run npm run bootstrap");
    } else if (data?.election_mode_enabled !== true) {
      record("FAIL", "election_settings/default", "election_mode_enabled is not true");
    } else if (typeof data.active_contest_id === "string" && data.active_contest_id !== "") {
      record(
        "WARN",
        "election_settings/default",
        `active_contest_id is "${data.active_contest_id}" — a fresh clone should start with none`,
      );
    } else {
      record("PASS", "election_settings/default", "mode on, no active contest");
    }
  } catch (error) {
    record("FAIL", "election_settings/default", error instanceof Error ? error.message : String(error));
  }

  /* site_settings/general + config/app are NOT written by bootstrap */
  try {
    const snap = await db.doc("site_settings/general").get();

    if (snap.exists) {
      record("PASS", "site_settings/general", "branding document exists");
    } else {
      record(
        "WARN",
        "site_settings/general",
        "not created yet — sign in as admin, Admin → Settings → Save (bootstrap does not create it)",
      );
    }
  } catch (error) {
    record("WARN", "site_settings/general", error instanceof Error ? error.message : String(error));
  }

  try {
    const snap = await db.doc("config/app").get();

    if (snap.exists) {
      record("PASS", "config/app", "present");
    } else {
      record("WARN", "config/app", "absent — optional; getAppName falls back to BRANDING");
    }
  } catch (error) {
    record("WARN", "config/app", error instanceof Error ? error.message : String(error));
  }

  /* ============================================================
   * 4. NO LEFTOVER CAMPAIGN DATA
   * ============================================================ */

  section("4. No leftover campaign data");

  const zeroCollections = [
    "election_results",
    "campaign_field_reports",
    "campaign_activities",
    "issues",
    "notifications",
  ];

  for (const collection of zeroCollections) {
    try {
      const found = await hasAny(db, collection);

      if (found) {
        record("FAIL", `${collection} empty`, "documents found — clear before handoff");
      } else {
        record("PASS", `${collection} empty`, "0 documents");
      }
    } catch (error) {
      record("FAIL", `${collection} empty`, error instanceof Error ? error.message : String(error));
    }
  }

  try {
    const assignmentCount = await countUpTo(db, "campaign_assignments", 5);

    if (assignmentCount >= 5) {
      record(
        "FAIL",
        "campaign_assignments under 5",
        "5 or more documents found — clear before handoff",
      );
    } else {
      record("PASS", "campaign_assignments under 5", `${assignmentCount} document(s)`);
    }
  } catch (error) {
    record("FAIL", "campaign_assignments under 5", error instanceof Error ? error.message : String(error));
  }

  /* ============================================================
   * 5. PARTY ACRONYM EXISTS
   * ============================================================ */

  section("5. Party");

  try {
    const snap = await db
      .collection("political_parties")
      .where("acronym", "==", BRANDING.partyAcronym)
      .limit(1)
      .get();

    if (snap.empty) {
      record(
        "FAIL",
        "party acronym exists",
        `no political_parties document with acronym "${BRANDING.partyAcronym}"`,
      );
    } else {
      record("PASS", "party acronym exists", BRANDING.partyAcronym);
    }
  } catch (error) {
    record("FAIL", "party acronym exists", error instanceof Error ? error.message : String(error));
  }

  /* ============================================================
   * 6. ASSETS REPLACED
   * ============================================================ */

  section("6. Branding assets");

  const faviconPath = path.join(process.cwd(), "src/app/favicon.ico");
  const candidateImagePath = path.join(
    process.cwd(),
    "public/images/candidate.jpeg",
  );

  if (fs.existsSync(faviconPath)) {
    record("PASS", "src/app/favicon.ico present", "replace with the client's icon");
  } else {
    record("FAIL", "src/app/favicon.ico present", "missing");
  }

  if (!fs.existsSync(candidateImagePath)) {
    record("FAIL", "candidate placeholder present", "public/images/candidate.jpeg missing");
  } else {
    record(
      "PASS",
      "candidate placeholder present",
      "note: not referenced by code — real portraits come from Cloudinary",
    );

    const after = process.env.CLONE_IMAGE_AFTER?.trim();

    if (!after) {
      record(
        "WARN",
        "candidate image replaced",
        "set CLONE_IMAGE_AFTER=YYYY-MM-DD to enforce the mtime check",
      );
    } else {
      const cutoff = Date.parse(after);
      const mtime = fs.statSync(candidateImagePath).mtimeMs;

      if (Number.isNaN(cutoff)) {
        record("WARN", "candidate image replaced", `CLONE_IMAGE_AFTER="${after}" is not a date`);
      } else if (mtime < cutoff) {
        record(
          "FAIL",
          "candidate image replaced",
          `public/images/candidate.jpeg predates ${after} — replace it`,
        );
      } else {
        record("PASS", "candidate image replaced", `modified after ${after}`);
      }
    }
  }

  /* ============================================================
   * 7. NO HARDCODED CANDIDATE STRINGS IN SRC
   * ============================================================ */

  section("7. No hardcoded candidate strings");

  const allowed = new Set([
    path.join(process.cwd(), "src", "config", "branding.ts"),
  ]);

  const offenders: string[] = [];
  const sourceRoot = path.join(process.cwd(), "src");

  if (fs.existsSync(sourceRoot)) {
    for (const file of sourceFiles(sourceRoot)) {
      if (allowed.has(file)) continue;

      const text = fs.readFileSync(file, "utf8");
      const lines = text.split(/\r?\n/);

      lines.forEach((line, index) => {
        if (/ifeanyi-2027|ifeanyi/i.test(line)) {
          offenders.push(
            `${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim().slice(0, 120)}`,
          );
        }
      });
    }
  }

  if (offenders.length > 0) {
    record(
      "FAIL",
      "no hardcoded Ifeanyi strings outside src/config/branding.ts",
      `${offenders.length} occurrence(s)`,
    );
    for (const offender of offenders.slice(0, 20)) {
      console.log(`        ${offender}`);
    }
    if (offenders.length > 20) {
      console.log(`        … ${offenders.length - 20} more`);
    }
  } else {
    record(
      "PASS",
      "no hardcoded Ifeanyi strings outside src/config/branding.ts",
      "0 occurrences",
    );
  }

  /* Informational: the exact folders this clone will upload to. */
  section("Cloudinary folders resolved for this clone");

  for (const folder of [
    "news",
    "gallery",
    "candidate",
    "candidate/manifestos",
    "election-results",
    "pu-reports",
    "incidents",
  ]) {
    console.log(`  ${cloudinaryFolder(folder)}`);
  }

  finish();
}

function finish(): void {
  const pass = rows.filter((r) => r.status === "PASS").length;
  const warn = rows.filter((r) => r.status === "WARN").length;
  const fail = rows.filter((r) => r.status === "FAIL").length;

  console.log(
    `\nSummary: ${pass} PASS, ${warn} WARN, ${fail} FAIL ` +
      `(${rows.length} checks)`,
  );

  if (fail > 0) {
    console.log("Clone is NOT ready for handoff.");
    process.exitCode = 1;
    return;
  }

  if (warn > 0) {
    console.log("Clone is ready, but review the WARN items above.");
    return;
  }

  console.log("Clone is ready for handoff.");
}

main().catch((error) => {
  console.error("\nverify-clone crashed:", error);
  process.exitCode = 1;
});
