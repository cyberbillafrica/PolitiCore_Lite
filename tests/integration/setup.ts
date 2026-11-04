/*
 * Integration-test setup: env first, then point the app's real `auth` and
 * `db` instances at the emulators.
 *
 * `./env` must stay the FIRST import — it sets the project id that
 * `src/lib/firebase/config.ts` reads at module load.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AUTH_EMULATOR_URL,
  FIRESTORE_EMULATOR_PORT,
} from "./env";

/*
 * Give the Admin SDK a syntactically valid application-default credential.
 * The emulators ignore it, but without a file the SDK probes the GCE
 * metadata server first, which blocks for ~30s per process on a machine
 * that is not running on GCP — close enough to the test timeout to make
 * this suite flaky.
 */
const adcDir = mkdtempSync(join(tmpdir(), "politicore-adc-"));
const adcPath = join(adcDir, "credentials.json");

writeFileSync(
  adcPath,
  JSON.stringify({
    type: "authorized_user",
    client_id: "emulator.apps.googleusercontent.com",
    client_secret: "emulator",
    refresh_token: "emulator",
  }),
);

process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath;

import { connectAuthEmulator } from "firebase/auth";
import { connectFirestoreEmulator } from "firebase/firestore";

import { auth, db } from "@/lib/firebase/config";

connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", FIRESTORE_EMULATOR_PORT);
