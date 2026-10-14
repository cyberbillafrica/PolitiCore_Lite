# Contest Scope

The active contest is the single source of truth for election
geography. This document describes the model, how the dashboard derives
its geographic filter from it, and how each page consumes it.

## The model

`src/lib/election-scope.ts` is the single source of truth. A contest
(`election_contests/{id}`) declares its geography through
`scope_type` + `scope_id` / `lga_ids`:

| scope_type | LGA restriction |
| --- | --- |
| `national`, `state` | none (whole state — all 17 LGAs) |
| `lga` | exactly `scope_id` |
| `senatorial_zone`, `federal_constituency`, `state_constituency` | the `lga_ids` list |

Key functions:

- `resolveContestLgaIds(contest)` → `null` (unrestricted) or the LGA id
  list. Never returns an empty list: a contest with no LGAs configured
  is treated as unrestricted, not as excluding everything.
- `lgasWithinContestScope(contest, allLgas)` → the LGA objects inside
  scope (dropdown source).
- `isWithinContestScope` / `contestCoversWard` / `contestCoversPollingUnit`
  → submission-time checks.
- `describeContestScope(contest, allLgas)` → human-readable scope label.

The active contest is read from the single `election_settings` document
(`active_contest_id`) via `useActiveContest()`
(`src/hooks/useElectionEngine.ts`), which resolves the contest and
exposes `lgaIds` in one hook.

**Nothing may pin an operation to a fixed LGA.** No hardcoded LGA
defaults exist in the scope model; when no contest is active, election
operations are unavailable rather than defaulting to "all of Enugu".

## The dashboard geographic filter

`src/app/portal/election/page.tsx`:

- `scopedLgas = lgasWithinContestScope(activeContest, lgas)` feeds the
  LGA dropdown — only LGAs inside the contest appear.
- **Single-LGA contest** → the LGA selector is LOCKED (disabled, no
  "All" option, auto-selected to the contest's LGA).
- **Multi-LGA contest** → the dropdown offers those LGAs plus an
  "All In Scope" option; never anything outside them.
- **State-wide contest** → all 17 LGAs plus "All LGAs".
- Ward dropdown lists only the wards of the selected LGA; the PU
  selector (where present) lists only PUs of the selected ward.
- "Official Approved PUs" denominator = the PU count of `scopedLgas`
  (optionally narrowed by the selected LGA/ward) — e.g. a Nkanu West
  House of Assembly contest shows Nkanu West's PU count, never 4,108.
- Coverage % = approved PUs ÷ that scoped denominator.
- All aggregates (total votes, party totals, leading party, margin) are
  computed over `contestScopedResults` — results filtered to the
  contest's LGA set. A result's LGA is resolved via `lgaIdForResult()`
  (`src/lib/election-read-scope.ts`): its stored `lga_id`, falling back
  to the LGA that owns its ward.

## Result center aggregation level (round 3)

The aggregation card level follows the contest
(`aggregationLevel` in the dashboard):

| Contest scope | Card | Rows |
| --- | --- | --- |
| state / national | "LGA by LGA Official Results" | one per LGA |
| LGA-scoped (House of Assembly / Reps, zones, constituencies) | "Ward by Ward Official Results" | one per ward + a single-row summary of the whole contest scope |
| ward-scoped | "Polling Unit by Polling Unit Official Results" | one per PU |

"Official Vote Distribution" always shows at the appropriate level, and
the empty-state messages ("…in this scope") respect the contest scope.

## How each page consumes scope

| Page | Behaviour |
| --- | --- |
| `portal/election/page.tsx` | LGA/ward filters, denominator, coverage and aggregates all scoped (above). |
| `portal/election/results/page.tsx` | Loaded results are filtered to the contest's LGA set; ward/PU selectors derive from the scoped set. |
| `portal/election/operations/page.tsx` | Contest selector filters the queue; geography labels resolve from the live dataset. |
| `portal/election/pu-reports/page.tsx` | Form LGA selector = `lgasWithinContestScope`; ward/PU chain inside the selected LGA. |
| `portal/election/incidents/page.tsx` | Same as pu-reports. |
| `portal/election/upload/page.tsx` | Submissions validated with `isWithinContestScope` (round 1). |
| `src/components/dashboard/ElectionOfficerDashboard.tsx` | Scope banner, scoped Wards/PU counts, coverage denominator, disabled actions without an active contest. |
| Registration (`/volunteer`, admin add-member) | LGA dropdown = contest scope for signed-in forms; the anonymous volunteer form intentionally shows all LGAs (option (b) from round 2 — the active contest is not published to the public). |

## Read scope vs contest scope

Two different boundaries exist and must not be confused:

- **Contest scope** (this doc) — *where* in the state an operation
  happens. Driven by the active contest.
- **Read scope** (`src/lib/election-read-scope.ts`) — *which documents*
  an account may read. Driven by role and organizational assignments,
  mirroring what the `user_access` projection grants
  (`src/lib/firebase/userAccess.ts`), because Firestore queries must be
  provably readable in full by `firestore.rules`.

Query-level scoping lives in `src/lib/firebase/election.ts`
(`subscribeToElectionResults` / `subscribeToPUReports` /
`subscribeToElectionIncidents`): one provable equality query per
constraint, merged by document id.
