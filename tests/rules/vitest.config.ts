import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/*
 * Rules tests are intentionally separate from the Next.js app: they run
 * against the Firebase emulator (see docs/emulator-setup.md), import no
 * React and no `@/lib/firebase/config`, and are never part of `next build`.
 *
 * Root is pinned to the project root so a test run from any cwd resolves
 * `tests/rules/**` and `firestore.rules` the same way.
 */
const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  resolve: {
    /* Same alias the app uses, so tests can import the real projection. */
    alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) },
  },
  test: {
    include: ["tests/rules/**/*.test.ts"],
    environment: "node",

    /* The emulator round-trips every operation; a cold start is slow. */
    testTimeout: 30_000,
    hookTimeout: 90_000,

    /*
     * One test file at a time. Every file clears the emulator between
     * tests, so parallel files would delete each other's fixtures.
     */
    fileParallelism: false,
  },
});
