# Election Officer Role

Who the role is, what it can do, how its dashboard differs from other
roles, the review queue, and the contest-scope boundary.

## Who is an Election Officer

An `election_officer` is one of the three application access roles
(`admin`, `member`, `election_officer`) defined in `src/types/index.ts`
(`Role`). The role is granted by an administrator on the Admin →
Members page (Role field) or at creation in
`src/app/portal/admin/members/add/page.tsx`.

Election officers run the collation process: they review polling-unit
result submissions against Form EC8 evidence and decide whether each
result becomes official. Per the Firestore rules, **approval authority
belongs to officers alone** — admins cannot approve or reject results
(`officerReviewUpdate()` in `firestore.rules` requires
`isElectionOfficer()`).

## What an officer can do

| Surface | Officer access |
| --- | --- |
| Election dashboard (`/portal/election`) | Full (central collation view) |
| Review queue (`/portal/election/operations`) | Full — approve / reject / clarify / reopen |
| PU Reports (`/portal/election/pu-reports`) | Submit + see all reports |
| Incidents (`/portal/election/incidents`) | Report + see all incidents |
| Result Upload (`/portal/election/upload`) | Submit results for any PU in contest scope |
| Results (`/portal/election/results`) | Read everything |
| Election Control Center (`/portal/admin/election`) | None (admin-only) |

Ordinary campaign members can submit for their **registered** polling
unit only; officers may submit anywhere inside the active contest's
scope (`canSubmitElectionActivity()` in `firestore.rules`).

## Navigation

`src/app/portal/layout.tsx` gates the election nav group:

- the group appears for admins, election officers and campaign members
  (`canAccessElectionSurfaces`);
- "Election Dashboard" and "Review Queue" are admin + officer only
  (`canViewElectionDashboard`);
- "PU Reports", "Incidents", "Results" and "Result Upload" are visible
  to all three audiences.

## The officer dashboard

`src/app/portal/dashboard` routes by role
(`src/app/portal/dashboard/page.tsx`): `election_officer` renders
`src/components/dashboard/ElectionOfficerDashboard.tsx`; admins and
members keep their dashboards.

The officer dashboard shows:

- a **scope banner** naming the active contest and its geography
  (`describeContestScope` from `src/lib/election-scope.ts`); when no
  contest is active it shows "No active contest — election operations
  are unavailable" and the submission quick-actions are disabled;
- four live stat cards (no placeholders): PU reports submitted by the
  officer, incidents reported by the officer, results submitted or
  reviewed by the officer (one query per provable read, merged by
  document id), and coverage = approved PUs ÷ PUs in contest scope;
- a **Review Submissions** card linking to
  `/portal/election/operations`;
- the officer's registered LGA / ward / polling unit (identity only).

## The review queue

`src/app/portal/election/operations/page.tsx`:

- **Officers** get the full queue and the Approve / Reject / Request
  Clarification / Reopen buttons (`reviewElectionResult` in
  `src/lib/firebase/election.ts`, matching `officerReviewUpdate()` +
  `validOfficerTransition()` in the rules).
- **Admins** may open the page for inspection and audit history only;
  the decision buttons are hidden (the rules would reject them anyway).
  Admin corrections go through the "Correct" action on the central
  dashboard, which returns the result to `pending_review` for officer
  verification (`adminCorrectionUpdate()` in the rules).
- **Regular members** are redirected to their dashboard.

## The contest-scope boundary

Officers are **not** global. Everything they do is bounded by the
active contest's scope — exactly like admins:

- submissions must fall inside the contest's LGA set
  (`src/lib/election-scope.ts` is the single source of truth);
- dashboard totals, the PU denominator and coverage all compute inside
  the contest scope;
- when no contest is active, submissions are unavailable.

See `docs/contest-scope.md` for how scope propagates through the pages.
