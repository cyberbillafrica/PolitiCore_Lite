# Cloning PolitiCore Lite for a new candidate

This is the exact, ordered process for turning this repository into a
separate deployment for another candidate. It assumes **no source edits
are needed for branding** — everything candidate-specific is either an
environment variable, Firestore content, or one of the manual items in
[Manual per-client items](#manual-per-client-items).

The golden rule: **a clone gets its own Firebase project and its own
Cloudinary folder prefix.** Never point a new candidate at the source
project.

---

## Prerequisites

- Node 20+ and npm 10+.
- Firebase CLI: `npm install -g firebase-tools` (or prefix commands with `npx`).
- Access to this repository (copy it, do not develop the client directly on `main`).
- A Firebase account that can create projects.
- A Cloudinary account (shared agency account is fine).
- A Vercel account connected to the clone repository.
- The candidate's photo, party logo, and brand colours.

---

## Step 1: Create the Firebase project

1. Open <https://console.firebase.google.com> → **Add project**.
2. Name it `candidate-{name}-{year}` (for example `candidate-okafor-2031`).
3. Disable Google Analytics unless the client asks for it.
4. **Firestore Database** → **Create database** → **Production mode** → choose the region closest to the campaign (for Nigeria, `europe-west1` or `africa-south1` if available).
5. **Authentication** → **Get started** → enable **Email/Password** only.
6. Do **not** create collections, documents, or users yet. `bootstrap` creates the baseline.

## Step 2: Service account key

1. Firebase Console → ⚙️ **Project settings** → **Service accounts**.
2. Click **Generate new private key** → **Generate key**. A JSON file downloads.
3. Rename it `serviceAccountKey.json` and place it at the repository root.
4. Confirm it is ignored: `git check-ignore -v serviceAccountKey.json` must print a rule (exit 0). It is in `.gitignore` already.
5. Never commit it, paste it in chat, or put it in Vercel.

## Step 3: Cloudinary

1. Decide on the folder prefix for this candidate: `{name}-{year}` (lowercase, hyphens, e.g. `okafor-2031`). Every upload goes under it.
2. If using a shared agency account, note the existing **cloud name**; create a dedicated **unsigned upload preset** for this client (Settings → Upload → Add upload preset → Signing mode: Unsigned).
3. If using a per-client account, create it and note the cloud name + upload preset.
4. Do not pre-create folders — Cloudinary creates them on first upload. The prefix must match `NEXT_PUBLIC_CLOUDINARY_FOLDER_PREFIX` exactly.

## Step 4: Environment variables

1. Copy the committed example: `cp .env.example .env.local`.
2. Fill in every value. `.env.example` documents the full set; the branding block ships with the source deployment's values as defaults.

| Key | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` (7 keys) | Firebase Console → Project settings → General → Your apps → SDK setup and configuration |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary dashboard |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Cloudinary → Settings → Upload → your unsigned preset |
| `NEXT_PUBLIC_CLOUDINARY_FOLDER_PREFIX` | Step 3, e.g. `okafor-2031` |
| `NEXT_PUBLIC_SITE_URL` | Final production origin, no trailing slash, e.g. `https://okafor2031.org` |
| `NEXT_PUBLIC_BRAND_APP_NAME` | Campaign identity, e.g. `Okafor 2031` |
| `NEXT_PUBLIC_BRAND_SHORT_NAME` | Platform name in normal case (may stay `PolitiCore`) |
| `NEXT_PUBLIC_BRAND_NAME` | Platform wordmark as displayed (`POLITICORE`) |
| `NEXT_PUBLIC_BRAND_MONOGRAM` | Two-letter logo fallback (`OK`) |
| `NEXT_PUBLIC_BRAND_CANDIDATE_NAME` | Common name (`Okafor`) |
| `NEXT_PUBLIC_BRAND_CANDIDATE_FULL` | Full display name |
| `NEXT_PUBLIC_BRAND_CANDIDATE_LEGAL_NAME` | Single-name form used in the documentation title |
| `NEXT_PUBLIC_BRAND_PARTY_ACRONYM` | Must match a `political_parties` acronym (e.g. `APC`) |
| `NEXT_PUBLIC_BRAND_YEAR` | Election year (`2031`) |
| `NEXT_PUBLIC_BRAND_TAGLINE` | Platform descriptor |
| `NEXT_PUBLIC_BRAND_BRAND_TAGLINE` | Short uppercase descriptor under the wordmark |
| `NEXT_PUBLIC_BRAND_SUPPORT_EMAIL` / `_FOOTER_PHONE` / `_FOOTER_ADDRESS` | Public contact details |
| `NEXT_PUBLIC_BRAND_OFFICE_NAME` / `_SECRETARIAT_NAME` | Office and secretariat labels |
| `NEXT_PUBLIC_BRAND_DEVELOPER_NAME` / `_URL` | Agency credit |
| `NEXT_PUBLIC_BRAND_PRIMARY_COLOR` / `_SECONDARY_COLOR` | Seed colours for site settings |
| `NEXT_PUBLIC_BRAND_ELECTION_DATE` / `_LABEL` | ISO UTC date + human label |

3. Next.js inlines `NEXT_PUBLIC_*` at **build time**. After changing any of these you must rebuild/redeploy; editing them in Vercel alone does nothing until the next deployment.

## Step 5: Replace branding assets

1. Replace `src/app/favicon.ico` with the client's icon (same filename).
2. Optionally replace the four placeholders in `public/images/` (`candidate.jpeg`, `candidate1.jpg`, `official_logo.jpeg`, `official_logo1.jpg`). **They are not referenced by code** — they are leftovers. The portrait, logo and hero image that actually render are Cloudinary URLs stored in Firestore.
3. Upload the real portrait via **Admin → Biography**, and the logo/hero via **Admin → Settings** after Step 9.

## Step 6: Install and bootstrap

```bash
npm install
npm run bootstrap          # baseline: hierarchy fallback, settings, parties, cycle, contests
npm run bootstrap:verify   # every baseline doc must report PASS
```

For an Enugu deployment, replace the one-LGA bootstrap fallback with the full hierarchy:

```bash
npx tsx scripts/seed-electoral-data.ts
npm run bootstrap:verify
```

If the client is **not** in Enugu, stop and read [Manual per-client items](#manual-per-client-items) — the hierarchy is data, not branding.

## Step 7: Deploy Firestore indexes

```bash
firebase deploy --only firestore:indexes --project <firebase-project-id>
```

Firebase Console → Firestore → **Indexes** → wait until every composite index is **READY**. Queries fail until they are.

## Step 8: Deploy Firestore rules

```bash
firebase deploy --only firestore:rules --project <firebase-project-id>
```

Rules are not optional: without them every read is denied.

## Step 9: First admin, then site settings

`bootstrap` **does not** create `site_settings/general` or `config/app`, and it does not create users. Do this manually, once:

1. Firebase Console → **Authentication** → **Add user** → email + password for the campaign admin.
2. Copy the new **UID**.
3. Firestore → **Start collection** `users` → document ID = the UID. Add:
   - `access_role`: `"admin"`
   - `membership_types`: `["campaign_member"]`
   - `full_name`: the admin's name
   - `email`: the same email
4. Sign in at `/login` with that account.
5. Go to **Admin → Settings**, edit the branding fields (organization name, wordmark, footer contact, colours, hero copy), then click **Save**.
   **This creates `site_settings/general` with the correct defaults.** Until this document exists the app renders the code defaults from `src/config/branding.ts`.
6. Optional: **Admin → About** → Save to create the `config/app` identity document.

## Step 10: Verify locally

```bash
npm run build   # must exit 0
npm run dev     # http://localhost:3000
```

- Sign in as the admin; the control center and **Admin → Election** must load.
- Open **Admin → News**, upload a small test image, and confirm in Cloudinary that it landed under `<prefix>/news` — not under `ifeanyi-2027/`.
- Delete the test article after checking.

## Step 11: Deploy to Vercel

1. Push the clone repository to its own remote.
2. Vercel → **Add New Project** → import that repository.
3. Framework preset: Next.js. Build command `npm run build`.
4. Add **every** `NEXT_PUBLIC_*` variable from `.env.local` to the Vercel project (Production and Preview).
5. Deploy, then update `NEXT_PUBLIC_SITE_URL` to the final domain and redeploy (canonical URLs use it at build time).
6. Confirm the deployment URL loads the home page and `/login`.

## Step 12: Smoke test with `verify:clone`

Run locally, with `.env.local` and `serviceAccountKey.json` in place:

```bash
npm run verify:clone
```

- Every check must be `PASS`; a `WARN` is acceptable only when it is explained in the note.
- Any `FAIL` is a clone blocker — do not hand the app over.
- To enforce photo replacement, set `CLONE_IMAGE_AFTER` (ISO date) to the date the clone was created; the image mtime check is skipped with a warning otherwise.
- The test-data checks are expected to `FAIL` on the **source** project (it has real campaign data). They must pass on the clone **before** content entry.

## Step 13: First content and one end-to-end result

1. **Admin → Biography**: candidate photo, name, bio, stats → Publish.
2. **Admin → Manifesto**: candidate name, document upload or text → Publish.
3. **Admin → Election**: create the cycle (year, dates), one contest (scope), political parties/candidates as needed. Leave **active contest** empty until operations begin.
4. Sign in as a test ward coordinator, submit one result for a polling unit inside their ward, then approve it as the election officer.
5. Confirm the EC8 photo is under `<prefix>/election-results`.
6. Delete the test result, test PU report, test field report, test activity, and any test notifications before handoff.

## Step 14: Handoff

Confirm and record:

- Production URL and admin login (delivered out of band, never in the repo).
- The Cloudinary folder prefix for this client.
- Which branding values were set via env vs **Admin → Settings** (settings win at runtime).
- That the client has changed the admin password.
- That `verify:clone` passes and the test-data collections are empty.

---

## Manual per-client items

These cannot be environment variables and are the only source edits a clone may need.

1. **Palette — `src/app/globals.css` `@theme` block.** Six values: `--color-apc-green`, `--color-apc-red`, `--color-apc-navy`, `--color-apc-primary`, `--color-apc-secondary`, `--color-apc-light`. All 54 files using `text-apc-primary` / `bg-apc-dark` follow automatically. Do not rename the classes.
2. **31 literal `#008751` (and `#39b978`, `#d71920`) values** in `src/components/layout/Footer.tsx`, `src/components/layout/Header.tsx`, and `src/lib/firebase/site-settings.ts`. These bypass the theme tokens; change them per client if the palette differs.
3. **`package.json` `"name"`.** Cannot be env-driven. Rename it and run `npm install` so `package-lock.json` follows.
4. **Images.** Replace `src/app/favicon.ico`. `public/images/*` are unreferenced placeholders; real imagery lives in Cloudinary via Firestore.
5. **Enugu hierarchy.** `src/data/electoral.ts` (offline fallback, Nkanu West only) and the seeded `electoral_data/enugu-state` (17 LGAs) are Enugu data. Another state requires new data and a review of `scripts/seed-electoral-data.ts`, `src/lib/firebase/election-seed.ts` contest scopes, and `site_settings` LGAs/senatorial zones (`stateRegion` defaults to `Enugu State`).
6. **Election dates/year.** `NEXT_PUBLIC_BRAND_ELECTION_DATE*` covers the countdown; the admin cycle form defaults (`2027-02-20` → `2027-03-15`) and the seeded 2027 cycle/contests in `src/lib/firebase/election-seed.ts` must be edited for a different election year.
7. **Exclude dead backups.** Six `*.bak-20261011-105439` files under `src/` are historical copies of election pages. They are not compiled; exclude them when archiving the clone:

   ```bash
   git archive --format=zip --prefix=politicore-clone/ HEAD | \
     zip -d - '*.bak-20261011-105439' > clone.zip
   ```

## Rollback

The source Firebase project is never touched by this process. If anything fails, delete the new Firebase project, the new Vercel project and the Cloudinary folder prefix, then start again from Step 1. Nothing in the source repository or its data changes.

## Common issues

- **`Missing or insufficient permissions` during bootstrap** — `serviceAccountKey.json` belongs to a different project. Compare its `project_id` with `NEXT_PUBLIC_FIREBASE_PROJECT_ID`; `bootstrap:verify` and `verify:clone` both fail loudly on a mismatch.
- **`The query requires an index`** — Step 7 indexes are still building. Wait for READY and retry.
- **Cloudinary 401 / `Upload preset not found`** — the preset is not unsigned, or the env vars are missing in the deployment. `NEXT_PUBLIC_*` values are baked at build time; add them and redeploy.
- **Branding still shows Ifeanyi 2027 after deploy** — either the env vars were added after the build, or `site_settings/general` still contains old values (settings override env). Re-save Admin → Settings.
- **Uploads land in `ifeanyi-2027/`** — `NEXT_PUBLIC_CLOUDINARY_FOLDER_PREFIX` was not set at build time. Fix, redeploy, and re-upload.
- **`npm run verify:clone` fails on test data** — the project still has content from a previous candidate or from testing. Clear those collections before handoff.
