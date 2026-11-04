import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/*
 * Integration tests, distinct from the rules suite:
 *
 *   rules tests        fake the caller with testEnv.authenticatedContext()
 *                      and write synthetic payloads
 *   integration tests  run the REAL client functions (signUpVolunteer)
 *                      against the auth + firestore emulators, with real
 *                      SDK auth state and real rules
 *
 * The distinction is the point: the rules suite cannot catch a client-flow
 * bug, which is how the Round 17 signup failure shipped.
 */
const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    environment: "node",

    /* Every test round-trips through two emulators. */
    testTimeout: 45_000,
    hookTimeout: 90_000,

    /* The client SDK keeps module-level state; never run these in parallel. */
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
