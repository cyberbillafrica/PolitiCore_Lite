import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

/*
 * ============================================================
 * FIREBASE EMULATOR TEST ENVIRONMENT
 * ============================================================
 *
 * Every rules test boots one environment per file, loads the real
 * `firestore.rules` from disk and talks to the Firestore emulator on
 * 8080 (started by `firebase emulators:exec`, see package.json).
 *
 * `demo-politicore` is a demo project id: the emulator never reaches
 * production, and `--project` must match it in the emulators:exec call.
 */

export const TEST_PROJECT_ID = "demo-politicore";

const RULES_PATH = fileURLToPath(new URL("../../firestore.rules", import.meta.url));

let testEnv: RulesTestEnvironment;

export function getTestEnv(): RulesTestEnvironment {
  if (!testEnv) {
    throw new Error(
      "Test environment is not initialized. Call initTestEnv() in beforeAll().",
    );
  }

  return testEnv;
}

export async function initTestEnv(): Promise<RulesTestEnvironment> {
  /*
   * When the emulator is started with `emulators:exec` these point at
   * the host/port it picked. Falling back to the ports in firebase.json
   * keeps `vitest` usable against an already-running emulator.
   */
  const host = process.env.FIRESTORE_EMULATOR_HOST?.split(":")[0] ?? "localhost";
  const port = Number(
    process.env.FIRESTORE_EMULATOR_HOST?.split(":")[1] ?? 8080,
  );

  testEnv = await initializeTestEnvironment({
    projectId: TEST_PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host,
      port,
    },
  });

  return testEnv;
}

export async function clearDb(): Promise<void> {
  await getTestEnv().clearFirestore();
}
