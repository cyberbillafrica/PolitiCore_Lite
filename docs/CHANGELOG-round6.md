# Round 6 — campaign permission baseline + cleanup

## Behaviour changes

1. **Plain campaign members now get a baseline projection.** A member with
   a complete home area holds 9 `user_access` documents after signup, so
   campaign reads stop failing with `Missing or insufficient permissions`
   and the summary spinners settle. See `docs/campaign-member-baseline.md`.
2. **Coordinators get the baseline on top of their grants.** That is what
   supplies the cascade-up `view_activities` at PU → ward → LGA → zone →
   state their dashboard aggregates over.
3. **The projection is recomputed, never appended.** Changing position,
   scope, access role, membership type or home area deletes the grants
   that no longer apply. A demoted coordinator keeps only the baseline.
4. **Legacy grants are no longer reachable.** No `tenant_id` field and no
   permission outside the campaign matrix is written by any path.
5. **Campaign pages are gated for the whole segment.** An election
   officer, or a social-only member, who navigates to a
   `/portal/campaign/*` URL is redirected to the dashboard they do have.
   Admins and campaign members are unaffected.
6. **Election officers are excluded from every campaign projection**, even
   when the account also carries `campaign_member`.

## Files

### Added

| File | Purpose |
|---|---|
| `src/lib/campaign-access.ts` | Pure projection model: eligibility, the 9 baseline documents, the per-position permission matrix, scope expansion, and the diff. Imports no Firebase, so the app and the Admin-SDK scripts compute from identical code. |
| `src/app/portal/campaign/layout.tsx` | Segment access gate (admin / campaign member allowed; election officer → `/portal/election`; social-only → `/portal/dashboard`). |
| `scripts/lib/campaign-access-admin.ts` | Shared Admin SDK toolkit: connect, load hierarchy, load users/assignments/actual grants, plan, apply. |
| `scripts/cleanup-stale-grants.ts` | Full-recompute cleanup for every user. `npm run cleanup:grants [-- --dry-run]`. |
| `scripts/project-campaign-access.ts` | Baseline migration. `npm run project:campaign-access [-- --dry-run]`. |
| `scripts/verify-campaign-access.ts` | Read-only assertion over the baseline. `npm run verify:campaign-access [-- --limit=N]`. |
| `scripts/check-campaign-projection.ts` | Offline regression for the projection (no network). `npm run check:campaign-projection`. |
| `docs/campaign-member-baseline.md` | Baseline model, eligibility, counts, lifecycle, migration. |
| `docs/stale-grant-cleanup.md` | Stale grants, why they accumulated, how to clean them. |

### Changed

| File | Change |
|---|---|
| `src/lib/firebase/userAccess.ts` | Campaign projection rewritten around `syncCampaignAccessForUser()`: reads the profile and active assignments, computes the expected set, diffs it against `access_projection_ids`, applies one batch (chunked, adds-first, above 450 operations). Adds `ensureBaselineCampaignProjection()` and `removeBaselineCampaignProjection()`. The election-result projection keeps its old semantics and is never deleted by a campaign diff. Removed `syncCampaignAccessForAssignment()` / `revokeCampaignAccessForAssignment()` — both were additive and are the root cause of the stale union. |
| `src/lib/firebase/organizationalAssignments.ts` | create / update / delete now call the full recompute instead of per-assignment add/remove. Election projection calls unchanged. |
| `src/lib/firebase/campaignMembers.ts` | `updateMemberAccessRole()`, `updateMemberMembershipTypes()` and area-affecting `updateCampaignMemberProfile()` calls recompute the projection. Name/phone edits do not. |
| `src/lib/firebase/auth.ts` | `signUpVolunteer()` ensures the baseline with the profile it just wrote (no read-back); `createMemberByAdmin()` runs the full recompute as the admin. |
| `src/lib/campaign-scope.ts` | `zoneIdForLga()` moved into `campaign-access.ts` (so scripts can use it without the Firebase client) and re-exported, keeping one implementation. |
| `firestore.rules` | One narrow write clause on `/user_access` so a member can provision their **own** baseline (`isBaselineAccessPayload()`, `isDerivableAccessId()`). Admin write and delete rules unchanged; `allow read: if false` unchanged. |
| `package.json` | Added `cleanup:grants`, `project:campaign-access`, `verify:campaign-access`, `check:campaign-projection`. |

## Verified

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | exit 0 |
| `npx tsx scripts/check-campaign-projection.ts` | all checks pass |
| `npx tsx scripts/check-campaign-scope.ts` | all checks pass (no regression from the `zoneIdForLga` move) |

Offline checks cover: the 9-document baseline and its exact ids, the
cascade-up `view_activities` grants, eligibility (social-only, election
officer, missing home area), PU/ward/LGA coordinator counts, demotion
keeping only the baseline, legacy permission documents being deleted, and
the election projection surviving every campaign diff.

## Not verified

- Live Firestore behaviour: rule evaluation, the real write counts, and
  the migration scripts against the production project.
- `npm run cleanup:grants` / `project:campaign-access` /
  `verify:campaign-access` were not executed — they write to the live
  project and need `serviceAccountKey.json` plus an operator decision.
- Cross-user notifications remain deferred (no notifications collection).

## Rules diff

Added inside `match /user_access/{accessId}`:

```
allow create: if isSignedIn()
  && userExists()
  && request.resource.data.user_id == request.auth.uid
  && request.resource.data.allowed == true
  && request.resource.data.scope_type is string
  && request.resource.data.scope_id is string
  && isBaselineAccessPayload(request.resource.data)
  && isDerivableAccessId(accessId, request.resource.data);

allow update: if isSignedIn()
  && userExists()
  && resource.data.user_id == request.auth.uid
  && request.resource.data.user_id == request.auth.uid
  && request.resource.data.allowed == true
  && isBaselineAccessPayload(request.resource.data)
  && isDerivableAccessId(accessId, request.resource.data);

allow delete: if isSignedIn()
  && userExists()
  && resource.data.user_id == request.auth.uid;
```

`isBaselineAccessPayload()` is the clamp: `view_activities` at the
caller's own PU / ward / LGA / zone / state, and the four other baseline
permissions at the caller's own PU only. `isDerivableAccessId()` requires
the document id to equal `uid__permission__scope_type__scope_id`, so an
id can never disagree with its contents.

The zone↔LGA mapping cannot be expressed in rules, so the zone grant is
limited to `view_activities`. That is the only relaxation, and it only
lets a member read activities their own zone-level grant covers.
