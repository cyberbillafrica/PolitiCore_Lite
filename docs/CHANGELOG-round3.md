# CHANGELOG — Round 3

Every file changed and behavior changed in this round. Uncommitted, for
review. `npm run build` and `npx tsc --noEmit` both pass.

## ISSUE 1 — Election Officer access, dashboard, review flow

| File | Change |
| --- | --- |
| `src/app/portal/layout.tsx` | Election nav: "Election Dashboard" is now admin **+ officer**; new "Review Queue" entry (`/portal/election/operations`, admin + officer); group gating passes officers. |
| `src/components/dashboard/ElectionOfficerDashboard.tsx` | Rewritten: contest-scope copy (no more "All Wards & Polling Units / Full Access"), scope banner via `describeContestScope`, "No active contest" state with disabled quick-actions, four live stat cards (no "—" placeholders), "Review Submissions" card → Operations, registered LGA/ward/PU via live lookup. |
| `src/app/portal/election/operations/page.tsx` | Access: officers full; admins keep the page but see no approve/reject buttons (inspection-only notice pointing at the Correct action); regular members redirected. `handleReview` refuses non-officers. Back link added. |
| `src/components/election/BackToDashboardLink.tsx` | **New** shared header back control → `/portal/dashboard`. |
| `src/app/portal/election/page.tsx`, `results/page.tsx`, `pu-reports/page.tsx`, `incidents/page.tsx`, `upload/page.tsx`, `export/page.tsx`, `src/app/portal/admin/election/page.tsx` | "Back to Dashboard" control in each header. |

Note: 1B (officer routing on `/portal/dashboard`) was already wired in
`src/app/portal/dashboard/page.tsx` — verified, unchanged.

## ISSUE 2 — Contest scope drives dashboard geography

| File | Change |
| --- | --- |
| `src/app/portal/election/page.tsx` | PU denominator now computed from `scopedLgas` (the round-2 code used the state-wide `lgas`, reporting 4,108 for multi-LGA contests). Contest-scope filtering uses `lgaIdForResult` (stored `lga_id`, falling back to the ward's LGA) so legacy results without `lga_id` are placed correctly. Single-LGA contests lock the selector; multi-LGA contests offer "All In Scope" (never "All LGAs"); ward dropdown reads from the scoped list. |
| `src/app/portal/election/results/page.tsx` | Loaded results filtered to the contest's LGA set; ward/PU selectors derive from the scoped set. |
| `pu-reports` / `incidents` | LGA → ward → PU chain was already contest-scoped from round 2 (verified). |
| `upload` | Already enforces `isWithinContestScope` (verified). |

## ISSUE 3 — Result center aggregation level

| File | Change |
| --- | --- |
| `src/app/portal/election/page.tsx` | New `aggregationLevel` derived from the active contest: state/national → "LGA by LGA Official Results" (LGA rows); LGA-scoped → "Ward by Ward Official Results" (ward rows) **plus a single-row summary of the whole contest scope**; ward-scoped → "Polling Unit by Polling Unit Official Results". "Official Vote Distribution" unchanged; the "…in this scope" empty states preserved. |

## ISSUE 4 — PU reports / incidents permission errors for members

| File | Change |
| --- | --- |
| `src/lib/firebase/election.ts` | `subscribeToPUReports` / `subscribeToElectionIncidents` now take scope constraints (own submissions + ward/PU reads) and merge one provable query per constraint (`subscribeMerged`). `ElectionResultScopeConstraint` gains `submitted_by`/`reviewed_by`. `buildResultQuery` rewritten generically — the old branch version silently dropped a polling-unit filter when a contest filter was present (a real round-2 bug). No orderBy anywhere → no composite indexes required. |
| `src/lib/election-read-scope.ts` | **New.** `buildElectionReadScope()` derives the provable read constraints from role + assignments, exactly mirroring the `user_access` projection (including: plain `campaign_member` assignments grant nothing; senatorial-zone assignments grant nothing). |
| `src/app/portal/election/pu-reports/page.tsx`, `incidents/page.tsx` | Listeners built from those constraints (own + scoped); the over-fetch-then-filter code removed. |

## ISSUE 5 — LGA / ward / PU display

| File | Change |
| --- | --- |
| `src/hooks/useElectoralLookup.ts` | **New.** Live state-wide name resolution (`getAllEnuguLGAs`, shared cache) with "Not assigned" fallbacks. Replaces the bundled single-LGA lookups that left other LGAs blank/raw. |
| `src/app/portal/profile/page.tsx` | LGA + Ward + PU fields (was ward/PU only, "Not set"). |
| `src/app/portal/campaign/members/page.tsx` | Directory rows show LGA / ward / PU. |
| `src/app/portal/campaign/members/[id]/page.tsx` | "Electoral Identity" card resolves LGA/ward/PU from live data; removed the **hardcoded "Nkanu West" LGA and "Enugu East Senatorial Zone"** labels (assignment scope display now derives from ids). |
| `src/app/portal/admin/members/page.tsx` | List column now "LGA / Ward / Polling Unit" with "Not assigned" fallbacks; edit save now persists `lga_id` (it was selected in the form but never written). |
| `src/components/dashboard/CampaignDashboard.tsx`, `SocialMemberDashboard.tsx`, `src/app/portal/layout.tsx` (sidebar), `src/app/portal/campaign/area/page.tsx`, `src/app/portal/leaderboard/page.tsx`, `src/app/portal/election/results/page.tsx` | Switched to the live lookup; dashboards now show LGA alongside ward/PU. |

## ISSUE 6 — Member suspension

| File | Change |
| --- | --- |
| `src/types/index.ts` | `UserProfile.status?: string` (+ optional `suspended_at`, `suspended_by`). |
| `src/lib/firebase/campaignMembers.ts` | `setMemberSuspended()` (admin write; profile never deleted). |
| `src/lib/firebase/auth.ts` | `subscribeToUserStatus()`, `flagSuspensionNotice()`, `consumeSuspensionNotice()`, `SUSPENSION_NOTICE_STORAGE_KEY`. |
| `src/contexts/AuthContext.tsx` | Suspended members are signed out at sign-in **and** ejected mid-session via a live watch on their own user doc. |
| `src/app/login/page.tsx` | One-time notice: "Your account has been suspended. Please contact an administrator." |
| `src/app/portal/admin/members/page.tsx` | Suspend / Un-suspend action with confirmation dialogs + red "Suspended" badge. |
| `firestore.rules` | `isActiveUser()` helper; `/election_results`, `/pu_reports`, `/election_incidents` reads **and creates** gated on it. Exact diff in `docs/member-suspension.md` — flagged for review. |

## ISSUE 7 — Floating help + expanded guide

| File | Change |
| --- | --- |
| `src/app/layout.tsx` | `<ContextualHelp />` mounted globally (every page, public + portal). |
| `src/components/help/ContextualHelp.tsx` | Button moved to bottom-right; renders for signed-out visitors (`PUBLIC_INTRO`); new "Help for this page" block from the route map. |
| `src/lib/help-content.ts` | Added `registering-as-a-volunteer`, `resetting-your-password` (accurately: no self-service reset exists), `inec-officer-registration`, `account-suspended`; added `PUBLIC_INTRO`, `HELP_ROUTE_MAP`, `helpArticlesForRoute()`. **Removed** the `donation-ledger` and `audit-logs` articles — they described Pro features with no route in Lite. |
| `src/app/portal/guide/page.tsx` | Rebuilt: table of contents + six sections (Getting Started, Members, Campaign, Election, Admin, Help), rendered from the same article data as the panel; the original manual's settings/structure/social-force/notifications content preserved inside the matching sections. |

## ISSUE 8 — Documentation

New: `docs/election-officer-role.md`, `docs/member-suspension.md`,
`docs/user-guide-system.md`, `docs/contest-scope.md`,
`docs/CHANGELOG-round3.md` (this file).

## Constraints honoured

- No tenant tokens anywhere; Admin/Settings entries untouched.
- No new hardcoded LGA defaults (two pre-existing hardcodes on the
  member-detail page were removed).
- Shared non-election helpers touched only where strictly required:
  `src/types/index.ts` (status fields), `src/lib/firebase/auth.ts`
  (suspension enforcement helpers), `src/contexts/AuthContext.tsx`
  (spec-named), `src/app/layout.tsx` (help mount).
- Every Firestore write passes the rules as written **except** the
  flagged rules diff under ISSUE 6 (suspension gates), which is
  intentionally stricter, not looser.
