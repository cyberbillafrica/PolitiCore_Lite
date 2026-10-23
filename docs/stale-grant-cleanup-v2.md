# Stale grant cleanup — v2 (Round 7)

## What Round 6 shipped, and why it did not delete

`syncCampaignAccessForUser()` computed the expected projection correctly
and wrote the missing documents. The delete half diffed the expected set
against **`access_projection_ids`** — an array on the user's profile
recording what the projection itself had written:

```ts
const recorded = recordedProjectionIds(raw);          // profile field
const { toAdd, toDelete } = diffCampaignAccess(expected, recorded);
```

A grant written before that field existed, by another writer, or by a
manual edit was **not in `recorded`**, so the diff treated it as
non-existent and never scheduled it for deletion. The migration report
said "0 deleted" and that looked like a clean database; it was actually
the delete path not running.

Chika is the canonical case: a former admin, later a plain member, still
carrying `assign_task`, `create_activity`, `create_assignment`,
`manage_activity`, `manage_issue`, `review_assignment`,
`review_field_report` — and, from earlier still, permissions that are no
longer in the matrix.

## What the delete path does now

`src/lib/firebase/userAccess.ts`:

1. Reads the profile (state + recorded ids).
2. **Enumerates the documents that actually exist**
   (`loadExistingCampaignAccess`): `where("user_id", "==", uid)` on
   `user_access`, restricted to this projection's namespace.
3. Unions recorded + existing, then diffs against the expected set.
   Anything not expected is deleted — including unrecorded documents.
4. An expected document whose payload is stale (`tenant_id`, a legacy
   key, `allowed !== true`, a permission/scope that disagrees with its
   id) is **rewritten** with a full replace, so the stale fields go too.
5. Writes the new `access_projection_ids` index.

The `view_election_results` permission is never touched by any of this;
it belongs to the separate election projection.

### Why it can read the collection

`user_access` was `allow read: if false`. Two clauses were added:

- `allow read: if isAdmin()` — the admin who demotes a coordinator runs
  the recompute in their own session and must see the target's grants.
  Admins already write and delete these documents.
- `allow read: if isSignedIn() && resource.data.user_id == request.auth.uid`
  — a member changing their own home area enumerates their own grants.

Neither exposes another user's grants to a non-admin.

## Verifying a demotion

With the emulator:

```
npm run test:rules -- lifecycle-delete
```

`tests/rules/lifecycle-delete.test.ts` proves, against the real rules:

- PU coordinator → plain member leaves exactly 9 baseline documents;
- ward 04 coordinator → PU 01-004 removes all 12 ward-04 grants and adds
  the 7 PU grants;
- admin → member removes legacy `manage_documents`, `send_notice`,
  `view_analytics`, `manage_members`;
- removing `campaign_member` deletes every campaign grant and keeps
  `view_election_results`;
- a grant that was never recorded is still deleted;
- a document with `tenant_id` is rewritten clean;
- a second run deletes nothing (idempotent).

With the Admin SDK (production, **not run in Round 7**):

```
npm run cleanup:grants                # dry run
npm run cleanup:grants -- --apply     # writes
npm run verify:campaign-access
```

## Expected counts after cleanup

| Role | Documents |
|---|---|
| plain member | 9 |
| PU coordinator (own PU) | 16 |
| PU coordinator (other PU) | 21 |
| ward coordinator (own ward) | 20 |
| LGA coordinator (own LGA) | 9 + 12 × 15 − 2 |
| state coordinator | 22 |
| election officer / social-only | 0 |

Round 7 also added the **zone target** to `resolveScopeTargets()`. A zone
coordinator previously held grants in every LGA and ward inside the zone
but none *at the zone itself*, so a zone-scoped query was denied. Existing
zone coordinators gain 12 documents at the next `cleanup:grants` run.

## Known limitation

The recompute is best-effort: a projection failure is logged, never
thrown, so the profile/assignment write that triggered it is not rolled
back. Manual edits in the Firebase console are repaired only on the next
write through the app or by the cleanup script.
