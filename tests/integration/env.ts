/*
 * Integration-test environment.
 *
 * MUST be imported before anything that reads `process.env` at module load
 * time (`src/lib/firebase/config.ts`). ES modules evaluate dependencies in
 * import order, so `import "./env"` first in setup.ts is enough.
 *
 * The project id is a Firebase *demo* id: the emulators refuse to reach any
 * real backend for it.
 */

export const INTEGRATION_PROJECT_ID = "demo-politicore";
export const FIRESTORE_EMULATOR_PORT = 8080;
export const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";

process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = INTEGRATION_PROJECT_ID;
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = `${INTEGRATION_PROJECT_ID}.firebaseapp.com`;
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "demo-api-key";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:1:web:1";

/* Read by the Firebase Admin SDK when it creates its clients. */
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FIRESTORE_EMULATOR_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
