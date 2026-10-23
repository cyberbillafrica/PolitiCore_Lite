# Firebase emulator + rules tests

Rules are code. This project runs them against the real Firestore
emulator, not against a mock, and every rules change ships with a test.

## Install (already done)

```
npm install -D firebase-tools "@firebase/rules-unit-testing@^5" "vitest@^3"
```

Notes:

- `@firebase/rules-unit-testing@6` requires `firebase@13`; this app is on
  `firebase@12`, so **v5** is the compatible line. Do not upgrade the
  testing package without upgrading the SDK.
- `vitest@5` requires `@types/node@>=24`; this project pins
  `@types/node@20`, so vitest stays on **v3**.
- Java 11+ is required by the Firestore emulator (`java -version`).

`firebase.json` at the project root:

```json
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": {
    "firestore": { "port": 8080 },
    "auth": { "port": 9099 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

## Run

```
npm run test:rules          # boots the emulator, runs tests/rules, shuts down
npm run test:rules:watch    # emulator only (UI at http://localhost:4000)
```

Single file:

```
npx firebase emulators:exec --project demo-politicore --only firestore,auth \
  "npx vitest run --config tests/rules/vitest.config.ts lifecycle-delete"
```

The emulator UI is a fast way to inspect what a test actually wrote. It
is read-only against the emulator; nothing touches production.

## Layout

```
tests/rules/
  vitest.config.ts   root, "@" alias, sequential files, 30s test timeout
  setup.ts           initializeTestEnvironment + clearFirestore
  helpers.ts         seedUser / seedBaselineAccess / seedActivity / …
  campaign-smoke.test.ts        reproduces the unfiltered-read failure
  campaign-activities.test.ts
  campaign-assignments.test.ts
  campaign-reports.test.ts
  issues.test.ts
  organizational-assignments.test.ts
  campaign-members.test.ts
  lifecycle-delete.test.ts
```

## Writing a test

```ts
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, getDocs, query, where } from "firebase/firestore";
import { authAs, seedBaselineAccess, seedUser } from "./helpers";

it("a member reads their own ward", async () => {
  await seedUser("chika", { ward_id: "nkanu-west-ward-01" });
  await seedBaselineAccess("chika");

  await assertSucceeds(
    getDocs(
      query(
        collection(authAs("chika"), "campaign_activities"),
        where("scope_type", "==", "ward"),
        where("scope_id", "==", "nkanu-west-ward-01"),
      ),
    ),
  );
});
```

Rules:

- Seed fixtures through `withSecurityRulesDisabled` (the helpers do) —
  never by weakening a rule to make seeding possible.
- Assert reads through `authAs(uid)` / `anonDb()`. That is the thing
  under test.
- `clearDb()` in `beforeEach`; test files run one at a time.
- Prefer the **same** filter shape the app uses (`queryByScopes()` runs
  the production grouping), so a green test means the app's query is
  allowed, not some nearby query.

## Reading a failure

The client SDK shows *"Missing or insufficient permissions"*. The
emulator (with debug messages) attaches the rules trace:

```
evaluation error at L699:22 … Property scope_type is undefined on object
```

An *evaluation error* on a LIST is the signature of an unfiltered query:
the rule reads a field the query left unknown. Fix the query, not the
rule.

## Why this is mandatory

Round 6 shipped a "verified" projection whose delete half had never
executed, and a rules change with no test. Both bugs were invisible to
`tsc` and `next build`. A rules change without an emulator test is not
verified.
