# Election audit trail (`election_audit`)

Every state change to an **election result** is appended to the
`election_audit` collection. The trail is append-only — clients may create
entries, never update or delete them — so it stays trustworthy even when
the results themselves are removed.

## Actions recorded

| Action | Who writes it | When |
| --- | --- | --- |
| `result_submitted` | submitting member/officer | result (Form EC8) uploaded |
| `result_corrected` | admin | correction from the dashboard |
| `result_approved` / `result_rejected` / `result_clarification_required` / `result_reopened` | election officer | review actions in the operations desk |
| `result_deleted` | officer or admin | permanent deletion |

## Document shape

```
action              one of the actions above
target_collection   "election_results" | "pu_reports" | "election_incidents"
target_doc_id       Firestore id of the affected document
actor_id            uid of the actor
actor_name          snapshot of their display name at action time
actor_role          snapshot of their role ("admin" | "election_officer" | …)
at                  server timestamp
reason              required for `result_deleted`, optional otherwise
metadata            { previous_status, new_status } (or null)
snapshot            FULL contents of the affected document — always present
                    for delete entries; earlier states for review/correct
```

Result docs also keep their inline `history` array (editing provenance that
travels with the document); the collection-level trail additionally
survives deletion of the document, which the inline array cannot do.

## The append-only guarantee

`firestore.rules` allows only:

- **create** — admins/officers with a validated shape (allowed action,
  target collection, doc id, `actor_id == request.auth.uid`,
  `at == request.time`, map-shaped metadata; deletions additionally need a
  non-empty reason and a map snapshot). A regular member may create only a
  `result_submitted` entry whose target is **their own submission**, proven
  with `getAfter()` in the same batch.
- **update** — one narrow exception only: an officer/admin may overwrite
  their **own** `__deleted__` entry for the same target id (a re-deletion
  after a resubmission; "latest delete wins").
- **delete** — always `false`. Not even admins.

All lifecycle writes (submit, review, correct) put the state change and its
audit entry in **one Firestore batch**, so the pair commits atomically.

## Deletion flow

`deleteElectionResultWithAudit` (`src/lib/firebase/election-audit.ts`) is
the single deletion path:

1. Requires a non-empty reason.
2. Deterministic audit id: `<target_doc_id>__deleted__<actor_uid>`.
3. One batch: write the audit entry (full snapshot + reason), then delete
   the result.
4. `firestore.rules` verifies the batch with `getAfter()` on that exact
   audit id before allowing the delete — a delete without a paired audit
   entry is refused, and the two writes commit or fail together.

## Reading the audit log

- UI: **/portal/admin/audit** (admin/officer only) — newest first, with
  actor names, reasons, expandable JSON snapshots.
- Code: `subscribeToElectionAudit()` in
  `src/lib/firebase/election-audit.ts`. No composite index is required
  (single-field `at` desc auto-index); client-side filtering only.

Actor names render from the point-in-time `actor_name` snapshot, falling
back to the live batch resolver in `src/lib/userNames.ts` — a row never
shows a raw doc id.

## Backfill note

Results that existed before this round are **not** backfilled — `election_audit`
only records actions performed after the feature shipped. Existing history
stays visible in each result's inline `history` array. `pu_report` and
`election_incident` actions are not yet audited (the schema and rules
already accept them as `target_collection`s for future extension).
