# CHANGELOG — Round 4

Single-tenant hardening round: strict active-contest scoping, live user
names, immutable result-deletion audit, fresh-deployment bootstrap.

## New files

| File | Purpose |
| --- | --- |
| `src/lib/userNames.ts` | Batch uid→name resolver (`resolveUserNames`, 30-id `in` chunks, "Unknown member" fallback — never a raw doc id) |
| `src/lib/firebase/election-audit.ts` | `election_audit` service: entry shape, lifecycle audit batches, `deleteElectionResultWithAudit`, `subscribeToElectionAudit` |
| `src/app/portal/admin/audit/page.tsx` | `/portal/admin/audit` — immutable audit log for admins/officers |
| `scripts/bootstrap.ts` + `npm run bootstrap` | idempotent baseline seeding for a fresh Firebase project (Admin SDK) |
| `scripts/verify-bootstrap.ts` + `npm run bootstrap:verify` | verifies every baseline document exists with the expected shape |
| `docs/bootstrap.md`, `docs/election-audit.md`, `docs/upload-scope.md` | round-4 docs |
| `tsx` (dev dependency) | runs the new scripts |

## Changed files

| File | Change |
| --- | --- |
| `firestore.rules` | new `election_audit` match (append-only create rules, narrow re-delete update, `delete: if false`); `election_results` create requires the ACTIVE contest + `activeContestAllowsLga()`; result **delete** allowed only for admin/officer with a `getAfter()`-verified paired `__deleted__` audit entry (full snapshot, non-empty reason); `pu_reports`/`election_incidents` creates require active-contest LGA scope |
| `src/types/index.ts` | `ElectionAuditAction`, `ElectionAuditEntry` types |
| `src/lib/firebase/election.ts` | submissions read the active contest **server-side** (`getStrictActiveContestId`, `requireActiveContest`) and validate ward/PU scope; result submit/review/correct write their audit entry in the same batch; `createPUReport`/`createElectionIncident` persist `lga_id` and verify scope; `NO_ACTIVE_CONTEST_MESSAGE` |
| `src/app/portal/election/upload/page.tsx` | fixed to the single ACTIVE contest (no contest/cycle pickers); LGA dropdown filtered to contest scope, locked for single-LGA contests; full PU-scope validation; no-active-contest gate |
| `src/app/portal/election/pu-reports/page.tsx` | ward/PU scope validation for all roles; no-active-contest gating; batched submitter names |
| `src/app/portal/election/incidents/page.tsx` | ward scope validation for all roles; no-active-contest gating; batched reporter names |
| `src/app/portal/election/operations/page.tsx` | review queue filtered to contest scope; per-result scope guard; officer **Delete Result** with required reason; submitter/reviewer names |
| `src/app/portal/election/page.tsx` | admin correction carries actor name/role for the audit entry |

## Behaviour changes (user-visible)

- No active contest → every submission/review surface disabled with
  "No active contest — election operations are unavailable."
- Submissions accepted only for the active contest and inside its LGAs.
- Every person reference (submitted/reviewed/reported by) renders a live
  display name.
- `/portal/admin/audit` — new page, admin/officer only, read-only.
- Officer/admin result deletion (permanent) requires a reason; the full
  snapshot lands in `election_audit` first, in the same batch as the
  delete. Audit entries can never be deleted by any client; the only
  update permitted is an officer/admin overwriting their own
  `<result>__deleted__<uid>` entry when re-deleting a resubmitted result
  ("latest delete wins") — see `election-audit.md`.
- Names resolve live; they are **not** denormalised onto result/report/
  incident docs.
