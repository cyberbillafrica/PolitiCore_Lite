# Round 7 — campaign read paths, emulator tests, delete-path repair

## The bug

Every campaign page failed for plain campaign members with *"Missing or
insufficient permissions"* even though their `user_access` projection was
complete. The pages queried whole collections
(`getDocs(collection(db, "campaign_activities"))`, `scope_chain
array-contains "enugu-state"`). Firestore validates a list query against
the rules before streaming and must prove every possible result is
readable; one out-of-scope document failed the entire read.

Separately, Round 6's projection diffed only against the ids it had
recorded on the profile, so a grant written before that index (or by
another writer) was never deleted.

## New files

| File | Purpose |
|---|---|
| `firebase.json` | Firestore rules + emulator ports |
| `firestore.indexes.json` | composite indexes for the scope-safe queries |
| `src/lib/campaign-read-scope.ts` | pure scope computation: baseline, coordinator, grouping, chunking |
| `src/lib/firebase/query-debug.ts` | `campaignRead()` logs collection + filter on failure |
| `tests/rules/vitest.config.ts` | vitest root, `@` alias, sequential files |
| `tests/rules/setup.ts` | emulator test environment |
| `tests/rules/helpers.ts` | seed + auth helpers, real hierarchy fixture |
| `tests/rules/campaign-smoke.test.ts` | reproduces the unfiltered-read failure |
| `tests/rules/campaign-activities.test.ts` | 15 assertions |
| `tests/rules/campaign-assignments.test.ts` | 16 assertions |
| `tests/rules/campaign-reports.test.ts` | 10 assertions |
| `tests/rules/issues.test.ts` | 12 assertions |
| `tests/rules/organizational-assignments.test.ts` | 10 assertions |
| `tests/rules/campaign-members.test.ts` | 5 assertions |
| `tests/rules/lifecycle-delete.test.ts` | 8 assertions, the delete path |
| `docs/campaign-read-queries.md` | the query pattern + indexes |
| `docs/emulator-setup.md` | how to run/write rules tests |
| `docs/stale-grant-cleanup-v2.md` | what Round 6 missed, what changed |

## Changed

### `src/lib/firebase/campaignActivities.ts`

- `getActivitiesInScope(scope, area?)` now issues one provable query per
  `(scope_type, scope_id)` group instead of `scope_chain
  array-contains`. Baseline PU / ward / LGA / zone / state plus the
  coordinator's scopes.
- Coordinators additionally query PU-scoped rows by the new
  `scope_ward_id` stamp.
- `createCampaignActivity()` stamps `scope_ward_id` (ward id for a ward
  or PU row, null above).
- Every read is wrapped in `campaignRead()` for diagnosable failures.

### `src/lib/firebase/campaignAssignments.ts`

- `getAssignmentsInScope(scope, lgas?)` takes the resolved scope; the
  `target_ward_id` query runs only for a coordinator (a plain member has
  no ward grant).
- Reads wrapped in `campaignRead()`.

### `src/lib/firebase/campaignMembers.ts`

- `getMemberPositions(userIds, scope)` queries by scope
  (`scope_type`/`scope_id`/`status`) instead of `user_id in […]`, which
  no rule could prove. One extra parameter on the Members page.

### `src/lib/firebase/campaignIssues.ts`

- Read queries wrapped in `campaignRead()`; `chunkIds()` replaces a
  local chunk loop.

### `src/lib/firebase/campaignReports.ts`

- Removed `getReportsForAssignment()`: it filtered on `assignment_id`
  only, which no rule reads, and had no callers.
- Reads wrapped in `campaignRead()`.

### `src/lib/firebase/userAccess.ts`

- `loadExistingCampaignAccess()` enumerates the documents that exist and
  flags stale payloads.
- The diff runs against recorded **∪ existing**, so unrecorded stale
  grants are deleted.
- Expected documents with stale fields are rewritten; writes are full
  replaces (no `merge`), which strips `tenant_id`.
- `ensureBaselineCampaignProjection()` also uses full replace.

### `src/lib/campaign-access.ts`

- `resolveScopeTargets()` now includes the zone itself, so a zone
  coordinator holds `senatorial_zone` grants.

### Pages

- `CampaignDashboard`, `campaign/area`, `campaign/activities` pass the
  profile's home area to `getActivitiesInScope`.
- `campaign/members` passes the scope to `getMemberPositions`.
- `campaign/assignments` only loads per-person completions for the
  creator or an admin (the rules deny the subcollection to a member who
  was merely targeted).
- `campaign/reports` and `campaign/assignments` drop the old
  `{ level, scopeId }` argument.

## Rules changes

1. `user_access`: `allow read: if isAdmin()` and self-read
   (`resource.data.user_id == request.auth.uid`). Required by the
   delete path; exposes no other user's grants.
2. `campaign_assignments`: read clauses for the legacy `assigned_to` /
   `assigned_by` fields that `getAssignmentsForUser()` queries.
3. `campaign_activities`: read clause for a PU-scoped row whose stamped
   `scope_ward_id` the caller holds `view_activities` for.

No admin handling changed. No permission outside the current matrix is
written.

## Behaviour changes

- A plain member's campaign pages load their own area instead of failing.
- A ward coordinator sees PU activities inside their own ward.
- A demoted user loses the previous position's grants on the next
  write-through.
- Zone coordinators gain zone-level documents at the next
  `cleanup:grants`.
- Members no longer see the per-person completion list of an assignment
  they did not create (it was always denied by the rules; the UI no
  longer asks).

## Verification

- `npm run test:rules` — 79 tests / 8 files, all passing.
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — see the Round 7 report.

No migration was run. No rules or indexes were deployed.
