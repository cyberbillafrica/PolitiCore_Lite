# Upload scope — nobody operates outside the active contest

Every submission surface (results, PU reports, incidents) and the review
queue is constrained to the **active contest's footprint** — admins and
election officers included. "Active contest" is
`election_settings/default.active_contest_id`, set from the admin election
control centre.

## Why

A contest defines the geography of the operation. A member registered in
Nsukka must not submit results for a contest covering only Nkanu West, and
an officer must not approve result rows from LGAs the active contest never
covered. Everything else derives from the contest's
`scope_type` / `scope_id` / `lga_ids`:

| scope_type | Allowed LGAs |
| --- | --- |
| `national`, `state` | every LGA (state-wide scope is legitimate) |
| `lga` | exactly `scope_id` (selector locked to that LGA) |
| `senatorial_zone`, `federal_constituency`, `state_constituency` | the LGAs listed on `lga_ids` (legacy rows fall back to the constituency reference) |

## How the client enforces it

Four layers, in order:

1. **UI selectors** — admin/officer/eligible-member LGA dropdowns are
   filtered with `lgasWithinContestScope()` (`src/lib/election-scope.ts`);
   a single-LGA contest locks the selector to that LGA. Regular members
   remain locked to their registered ward/PU.
2. **UI gates** — with no active contest, every submission window shows
   "No active contest — election operations are unavailable." and the
   forms are disabled.
3. **Service layer** — `submitElectionResultWithEvidence`,
   `createPUReport` and `createElectionIncident` re-read
   `election_settings/default` themselves, reject any contest other than
   the active one, and validate the ward/PU against
   `isWithinContestScope()` / `contestCoversPollingUnit()`. A crafted
   direct API post with a foreign contest_id or an out-of-scope PU is
   refused here.
4. **Firestore rules** — creates on `election_results`, `pu_reports` and
   `election_incidents` additionally require an active contest
   (`hasActiveContest()`), the submitted `contest_id` to equal it
   (results), and `activeContestAllowsLga()` — the same scope logic
   evaluated server-side, so the enforcement holds even when the client
   library is bypassed.

Review enforcement: the operations desk lists and reviews only results
inside the active contest's scope (`contestLgaIds` filter), and the review
and delete handlers re-check `isWithinContestScope()` before acting.

## Report/incident ownership (round 5)

The same principle as results applies to PU reports and incidents — a
contest scope check is not enough, because a member must also report from
the location they are actually registered at:

| Role | Where they may report |
| --- | --- |
| Admin, election officer | anywhere **within the active contest's zone** |
| Everyone else (members, incl. coordinators) | their **registered ward and polling unit** (`users/{uid}.ward_id` / `.polling_unit_id`) |

Enforced at three layers:

1. **Pages** — for non-admin/officers the LGA/ward/polling-unit selectors
   on `pu-reports` and `incidents` are disabled and locked to the
   registered location. A locked account whose profile has no registered
   ward (and polling unit) sees a warning and cannot submit until an
   admin sets the location.
2. **Service layer** — `createPUReport` / `createElectionIncident` re-read
   `users/{submitted_by}` themselves and refuse a mismatched ward/PU
   (`assertSubmitterRegisteredLocation`), so a forged direct post cannot
   farm other wards' PUs either.
3. **Firestore rules** — `election_incidents` create requires a member's
   `ward_id` to match their registration **and**, when a polling unit is
   attached, that PU to be their registered one. `pu_reports` already
   required the full `registeredAt(ward, pu)` pair.

Visibility (also rules-enforced):

- **Admins see everything**; election officers see everything too.
- **Scope-granting coordinators** (ward/LGA/zone/state via the
  `user_access` projection, see `election-read-scope.ts`) see all
  reports/incidents **within their assigned scope**.
- **A regular member** sees: their own submissions, plus
  reports/incidents at the polling unit they are registered at
  (`registeredAt()` read grant, round 5). Ward-level incidents (no PU
  attached) stay visible only to ward-scoped coordinators, admins and
  officers.

## What still needs the audit page?

Deletions and review actions go through the immutable `election_audit`
trail — see `election-audit.md`.
