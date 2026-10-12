import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import dotenv from "dotenv";
import type { EnuguStateElectoralData, LGA, Ward } from "../src/types";
dotenv.config({ path: ".env.local" });

/*
 * ============================================================
 * PARSING — proper ESM loading
 * ============================================================
 *
 * Every lgas/*.ts file is a TypeScript ES module (`import type`
 * + `export const ...: Ward[]`). The previous eval-based reader
 * could not parse ES import statements, so all 17 files failed
 * with "Cannot use import statement outside a module".
 *
 * tsx handles TypeScript + ESM natively, so each file is loaded
 * through a dynamic `import()` keyed by a file:// URL.
 */
async function loadWardsFromModule(file: string): Promise<Ward[]> {
  const filePath = path.join(process.cwd(), "lgas", file);
  const moduleUrl = pathToFileURL(filePath).href;

  const mod = (await import(/* webpackIgnore: true */ moduleUrl)) as {
    [key: string]: unknown;
  };

  /*
   * Pick the first exported array value — e.g. `aninriElectoralData`
   * from `export const aninriElectoralData: Ward[] = [...]`.
   */
  for (const value of Object.values(mod)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && "pollingUnits" in value[0]) {
      return value as Ward[];
    }
  }

  throw new Error(`No Ward[] export found in ${file}`);
}

function formatLgaNameAndCode(filename: string) {
  // e.g. "Nkanu_West_PUs.ts" -> "nkanu-west"
  // e.g. "Aninri_PUs.ts" -> "aninri"
  const baseName = filename.replace(/_PUs\.ts$/, "").replace(/\.ts$/, "");

  // Format ID: "Nkanu_West" -> "nkanu-west"
  const lgaId = baseName.toLowerCase().replace(/_/g, "-");

  // Format Name: "Nkanu_West" -> "Nkanu West"
  const lgaName = baseName.replace(/_/g, " ");

  // Format Code: "nkanu-west" -> "NW", "aninri" -> "AN"
  const parts = lgaId.split("-");
  let code = "";
  if (parts.length >= 2) {
    code = parts.map((p) => p[0].toUpperCase()).join("");
  } else {
    code = lgaId.slice(0, 2).toUpperCase();
  }

  return { lgaId, lgaName, code };
}

async function generateElectoralData(): Promise<EnuguStateElectoralData> {
  const lgasDir = path.join(process.cwd(), "lgas");
  if (!fs.existsSync(lgasDir)) {
    throw new Error(`Directory not found: ${lgasDir}`);
  }

  const files = fs
    .readdirSync(lgasDir)
    .filter((f) => f.endsWith(".ts"))
    .sort();

  const lgas: LGA[] = [];

  for (const file of files) {
    try {
      const lgaWards = await loadWardsFromModule(file);

      const { lgaId, lgaName, code } = formatLgaNameAndCode(file);

      lgas.push({
        id: lgaId,
        code: code,
        name: lgaName,
        wards: lgaWards,
      });
    } catch (err) {
      console.error(`Failed to load wards from file ${file}:`, err);
    }
  }

  return {
    state: "Enugu",
    lgas,
  };
}

/*
 * ============================================================
 * WRITING — Firebase Admin SDK
 * ============================================================
 *
 * The client SDK run unauthenticated was rejected by the
 * admin-only rules on electoral_data (Code: 7
 * PERMISSION_DENIED). The Admin SDK bypasses security rules.
 *
 * Credentials: the gitignored serviceAccountKey.json at the
 * project root. Its project_id must match
 * NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local.
 */

async function main() {
  console.log("Starting electoral data parsing...");

  const data = await generateElectoralData();
  console.log(`Parsed ${data.lgas.length} LGAs from /lgas directory.`);

  if (data.lgas.length === 0) {
    throw new Error("No LGAs were parsed — refusing to write an empty electoral_data document.");
  }

  const totalPus = data.lgas.reduce(
    (acc, lga) =>
      acc + lga.wards.reduce((wAcc, w) => wAcc + w.pollingUnits.length, 0),
    0,
  );
  console.log(
    `Parsed ${totalPus} polling units across ${data.lgas.reduce((a, l) => a + l.wards.length, 0)} wards.`,
  );

  // Prefer the service account key file over env vars.
  const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      "serviceAccountKey.json not found at the project root. Cannot seed via the Admin SDK.",
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync("./serviceAccountKey.json", "utf8"),
  );

  const envProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  console.log(`Service account project_id: ${serviceAccount.project_id} (NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${envProjectId})`);

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

  console.log("Connected via the Firebase Admin SDK. Writing electoral_data/enugu-state...");

  await adb.doc("electoral_data/enugu-state").set({
    state: data.state || "Enugu",
    lgas: data.lgas,
    updated_at: new Date(), // Admin SDK field value equivalent the app reads as a timestamp
  });

  console.log(
    `Successfully wrote electoral_data/enugu-state with ${data.lgas.length} LGAs to project ${serviceAccount.project_id}.`,
  );

  // Verify the write round-trips with the exact shape the app reads.
  const written = await adb.doc("electoral_data/enugu-state").get();
  const writtenData = written.data() as
    | { state?: string; lgas?: { id: string; wards: unknown[] }[] }
    | undefined;
  if (!written || !writtenData?.lgas || writtenData.lgas.length !== data.lgas.length) {
    throw new Error("Post-write verification failed: document shape/size mismatch.");
  }
  console.log(
    `Verified Firestore now holds ${writtenData.lgas.length} LGAs (first: ${writtenData.lgas[0].id}).`,
  );
}

main()
  .then(() => {
    console.log("Seed complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Unexpected error in seed script:", err);
    process.exit(1);
  });
