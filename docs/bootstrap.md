# Bootstrap — spinning up a fresh client deployment

This app is **single-tenant**: each client candidate gets their own copy of
the codebase deployed to their own Firebase project with their own (initially
empty) Firestore. `npm run bootstrap` writes the baseline documents a fresh
project needs. It seeds **no test data** — no users, no results, no incidents,
and no `election_audit` entries.

## Prerequisites

1. Create a Firebase project (Firestore in native mode).
2. Generate a service account key: Project settings → Service accounts →
   Generate new private key → save as `serviceAccountKey.json` in the
   project root (it is gitignored — never commit it).
3. Configure `.env.local` with the app's Firebase web keys + project id:

   | Key                            | Source                                  |
   | ------------------------------ | --------------------------------------- |
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | Project settings → Your apps (Web)      |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | same                                |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | same                                 |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | same                             |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | same                         |
   | `NEXT_PUBLIC_FIREBASE_APP_ID`  | same                                    |
   | cloudinary keys used by `src/lib/cloudinary.ts` | Cloudinary console      |

   `NEXT_PUBLIC_FIREBASE_PROJECT_ID` must match `project_id` inside
   `serviceAccountKey.json` — both scripts refuse to run on a mismatch.

## What `npm run bootstrap` writes

| Document | Purpose |
| --- | --- |
| `electoral_data/enugu-state` | geographic hierarchy (LGAs → wards → PUs); baseline carries the bundled dataset — run `npx tsx scripts/seed-electoral-data.ts` to replace it with the full 17-LGA parse |
| `election_settings/default` | `election_mode_enabled: true`, `active_contest_id: ""` (deliberately closed) |
| `election_cycles/general-election-2027` | the seeded 2027 cycle |
| `election_contests/{id}` | the five seeded 2027 contests (id values from `src/lib/firebase/election-seed.ts`) |
| `political_parties/{id}` | the INEC-registered party master list |

The script is idempotent: a document that already exists is skipped
(`SKIP`), never overwritten, never duplicated. Output lists each document
as `CREATE` or `SKIP` with a final `created/skipped` count.

## What `npm run bootstrap:verify` checks

Reads every baseline document above via the Admin SDK and expects each to
exist with the required shape (15 checks: electoral data, settings, 1 cycle,
5 contests, 15 parties). Exit code 0 = all pass; nonzero lists the `FAIL`
rows. The audit trail, `users`, `election_results`, `pu_reports` and
`election_incidents` are intentionally **not** verified — they only exist
once real activity happens.

## Recovery when a step fails partway

- **Create-and-write steps are all idempotent** — just fix the reported
  error (usually credentials/project mismatch) and re-run the same command.
  Already-written documents are skipped, so a partial run never duplicates.
- **Wrong project configured?** Nothing is destructive; the mismatch check
  aborts before any write.
- **Seeded contest set changed later?** `bootstrap` never overwrites; adjust
  contests from the admin election control centre instead.
- **After bootstrapping, activate a contest** in the election control
  centre. Until then every operations surface shows
  "No active contest — election operations are unavailable." (see
  `upload-scope.md`).

## Deploy

After bootstrap + verify: deploy the Next.js app with its own env vars and
publish `firestore.rules` (Firebase console or `firebase deploy`).
