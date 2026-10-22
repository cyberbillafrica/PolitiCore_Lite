# Round 5 — Campaign Scoping

Every campaign page now derives its reads and writes from the organizational
hierarchy, using the same scope vocabulary and coverage rules as the election
engine. Nothing is committed; this documents the change set.

Audit that preceded it: `docs/round5-campaign-scoping-audit.md`.

---

## 1. What was wrong before

1. **`pu_coordinator` did not exist** — no position, no permission case, no
   picker entry, no scope mapping.
2. **The Admin Coordination scope picker was a raw text field.** Admins typed
   `nkanu-west-ward-03` from memory, with no cascade, search, validation or
   duplicate disambiguation.
3. **My Area was dead code.** A local `useMyOrganizationalAssignments()` stub
   returned `[]`, so the page always rendered "No organizational assignment".
4. **No campaign page used `isScopeDescendant`.** Reads were exact-scope
   equality, which meant a ward coordinator saw neither their own PUs'
   activities nor their PUs' issues.
5. **Reports cascaded up** (exact-scope review read) when they must not, and
   **issues did not cascade up** when they must.
6. **Plain members could create activities and assignments** — `campaign_member`
   held `create_activity` and `assign_task`.
7. **Zone coordinators covered the whole state.** `isScopeDescendant()` returned
   `true` for every target once the source was `senatorial_zone`.
8. **Every non-admin campaign write was denied by the rules.** The rules read
   campaign permissions from `user_access`, and nothing ever wrote them.

## 2. Model changes

### New types (`src/types/index.ts`)

`CampaignPosition`, `AssignmentScope`, `CampaignAssignment`,
`AssignmentCompletion`, `CampaignReport`, `CampaignIssue`,
`CampaignAssignmentStatus`, `AssignmentCompletionMode`,
`CampaignIssueStatus`. `OrganizationalPosition` now includes `pu_coordinator`.

Position is **not** denormalised onto the profile. It is resolved from
`organizational_assignments` at read time (`getMemberPositions`).

### New module (`src/lib/campaign-scope.ts`)

The single place the hierarchy is expanded:

- `SCOPE_DEPTH`, `POSITION_SCOPE_LEVEL`, `COORDINATOR_PRIORITY`, `ZONE_IDS`
- `resolveCampaignScope(level, scopeId, lgas?) → CampaignScope | null`
- `resolveCampaignAuthority(profile, assignments)`
- `scopeCovers(source, target, lgas?)`
- `canCreateAtScope(profile, assignments, target, lgas?)`
- `describeScope(level, scopeId, lgas)`, `zoneLabel`, `zoneIdForLga`
- `scopeForAssignment(assignment, lgas?)`

### New hook (`src/hooks/useCampaignAuthority.ts`)

`useCampaignAuthority()` — profile, active assignments, resolved `CampaignScope`,
`scopeLabel`, `isCoordinator`, `positionLevel`, `canCreateAt`. Every campaign
page consumes it; none re-derives authority.

### New component (`src/components/campaign/ScopePicker.tsx`)

One cascading + searchable picker, imported in all six required places.

## 3. Per-page changes

| Page | Change |
|---|---|
| **Dashboard** (`CampaignDashboard.tsx`) | Real scope-aware summary. Plain member: ward/PU, own assignment counts, PU activities and issues, PU member count. Coordinator: position + scope label, members and PUs in scope, open assignments, pending reports received, open issues, recent activities. Admin: statewide counts. Every former `—` tile is now a real number with a language empty state. |
| **My Area** (`campaign/area`) | Stub hook deleted. Real scope stats, gated quick actions (Create Activity / Create Assignment / View Reports Received / View Issues), and a subordinate level filter. |
| **Members** (`campaign/members`) | Plain member → own PU only. Coordinator → scope and below plus a "Coordinators in my area" list with position and sub-scope. Admin → everyone with name/ward/PU/role/position filters. Positions resolved from `organizational_assignments`. Member detail page gained a scope guard (country-wide `/users` read means UI enforcement is required). |
| **Assignments** (`campaign/assignments`) | Dual target (user / scope / both), `completion_mode`, per-person completions subcollection, filters (status, target type, my role), creator approve/reject, manual close, coverage-checked creation with the shared picker. |
| **Activities** (`campaign/activities`) | Visibility from own scope down (`getActivitiesInScope`), creation limited to PU coordinator and above, admin scope picker for creation and filtering, status filter. |
| **Reports** (`campaign/reports`) | Report = submission against an assignment. Narrow visibility (submitter + assignment creator + admin only), approve/reject, admin scope filter. No cascade-up read. |
| **Issues** (`campaign/issues`) | Cascade-up reads + own issues, acknowledge/resolve with optional resolution notes, admin scope filter. |
| **Coordination** (`campaign/coordination`) | `pu_coordinator` added to the position list; all three raw scope text inputs replaced by the shared `ScopePicker`. |

## 4. Data layer changes

- `campaignAssignments.ts` — dual-target mapper (legacy-shape tolerant),
  `getAssignmentsForUser`, `getAssignmentsInScope`, `getAssignmentCompletions`,
  `markCompletionSubmitted`, `reviewCompletion`, `closeAssignmentIfComplete`,
  `targetWardIdForScope`.
- `campaignMembers.ts` — `getCampaignMembersInScope(scope)` (one path for every
  level), `getMemberPositions(uids)`, `isMemberInScope`, `getScopedCampaignMembers`
  rewritten on top of the resolver (zone now supported).
- `campaignActivities.ts` — `scope_chain`, `visibility_ward_ids`,
  `visibility_pu_ids` stamps; `getActivitiesInScope`,
  `getActivitiesForAdminScope`.
- `campaignReports.ts` — `assignment_id`, `assignment_creator_id`,
  `scope_snapshot`, review fields; `getReportsReceived`,
  `getReportsForAssignment`, `getAllCampaignReports(filter)`,
  `submitCampaignReport`, `reviewCampaignReport`.
- `campaignIssues.ts` — `scope_ward_id` stamp; `getIssuesInScope` (cascade up),
  `getMyCampaignIssues`, `raiseCampaignIssue`, `acknowledgeCampaignIssue`,
  `resolveCampaignIssue`.
- `userAccess.ts` — campaign permission projection, zone-aware expansion.
- `organizationalAssignments.ts` — project/revoke campaign access alongside the
  election-result projection on create, update and delete.

## 5. Firestore rules diffs (applied, R1–R5)

### R1 — `user_access` campaign projection

No rules text change. `src/lib/firebase/userAccess.ts` now writes one document
per campaign permission at every scope the assignment covers (global for
state, LGA + wards for a zone, the LGA + its wards for an LGA, the ward, the
PU). Polling units are not enumerated for ward/LGA/zone assignments; the ward
stamp in R4/R5 covers those reads.

**Before:** only `{uid}__view_election_results__…` documents existed, so
`hasAccess("create_activity" | "submit_field_report" | "report_issue" | …)`
was always false for non-admins.

**After (an LGA coordinator, illustrative):**

```
{uid}__view_members__lga__nkanu-west
{uid}__view_members__ward__nkanu-west-ward-01
… one row per permission × (the LGA + its wards)
```

### R2 — `organizational_assignments`

```diff
 match /organizational_assignments/{assignmentId} {
   allow read: if isAdmin()
     || (isSignedIn() && resource.data.user_id == request.auth.uid);
+  allow read: if isSignedIn()
+    && hasAccess("view_members", resource.data.scope_type, resource.data.scope_id);
   allow create, update, delete: if isAdmin();
 }
```

### R3 — `campaign_assignments` (+ completions subcollection)

```diff
 match /campaign_assignments/{assignmentId} {
   allow read: if isAdmin()
     || (isSignedIn() && resource.data.assigned_to == request.auth.uid);
+  allow read: if isSignedIn()
+    && resource.data.get("assigned_to_user", "") == request.auth.uid;
+  allow read: if isSignedIn()
+    && resource.data.get("created_by", "") == request.auth.uid;
+  allow read: if isSignedIn()
+    && hasAccess("view_assignments", resource.data.scope_type, resource.data.scope_id);
+  allow read: if isSignedIn()
+    && resource.data.get("target_ward_id", "") != ""
+    && hasAccess("view_assignments", "ward", resource.data.get("target_ward_id", ""));
-  allow create, update, delete: if isAdmin();
+  allow create: if isAdmin();
+  allow create: if isSignedIn()
+    && request.resource.data.get("created_by", "") == request.auth.uid
+    && hasAccess("create_assignment", request.resource.data.scope_type, request.resource.data.scope_id);
+  allow update, delete: if isAdmin();
+  allow update: if isSignedIn()
+    && resource.data.get("created_by", "") == request.auth.uid;
+
+  match /completions/{userId} {
+    allow read: if isAdmin() || request.auth.uid == userId
+      || (isSignedIn() && get(/databases/$(database)/documents/campaign_assignments/$(assignmentId)).data.get("created_by", "") == request.auth.uid);
+    allow create: if isAdmin()
+      || (isSignedIn() && get(…).data.get("created_by", "") == request.auth.uid);
+    allow update: if isAdmin() || request.auth.uid == userId
+      || (isSignedIn() && get(…).data.get("created_by", "") == request.auth.uid);
+    allow delete: if isAdmin();
+  }
 }
```

### R4 — `campaign_field_reports`

```diff
 match /campaign_field_reports/{reportId} {
   allow read: if isSignedIn()
     && resource.data.submitted_by == request.auth.uid;
   allow read: if isAdmin();
+  allow read: if isSignedIn()
+    && resource.data.get("assignment_creator_id", "") == request.auth.uid;
   allow read: if isSignedIn()
     && hasAccess("review_field_report", resource.data.scope_type, resource.data.scope_id);
   allow create: if isSignedIn()
     && request.resource.data.submitted_by == request.auth.uid
     && request.resource.data.status == "submitted"
+    && request.resource.data.get("assignment_id", "") is string
     && hasAccess("submit_field_report", request.resource.data.scope_type, request.resource.data.scope_id);
```

### R5 — `issues`

```diff
 match /issues/{issueId} {
   allow read: if isAdmin();
   allow read: if isSignedIn()
     && resource.data.reported_by == request.auth.uid;
+  allow read: if isSignedIn()
+    && resource.data.get("raised_by", "") == request.auth.uid;
   allow read: if isSignedIn()
     && hasAccess("manage_issue", resource.data.scope_type, resource.data.scope_id);
+  allow read: if isSignedIn()
+    && resource.data.get("scope_ward_id", "") != ""
+    && hasAccess("manage_issue", "ward", resource.data.get("scope_ward_id", ""));
   …
+  allow update: if isSignedIn()
+    && resource.data.get("scope_ward_id", "") != ""
+    && hasAccess("manage_issue", "ward", resource.data.get("scope_ward_id", ""));
 }
```

### R6 — `/users` (NOT changed)

`allow read: if isSignedIn()` is retained. Narrowing it would break login, the
member directory and the batch name resolver. Member visibility is enforced in
the data layer (`getCampaignMembersInScope`, `isMemberInScope`) instead. This is
a documented, accepted limitation, not an oversight.

## 6. Deferred

- **Cross-user notifications** (notify the assignee, the creator, the
  responder). No notifications collection exists; adding one plus a listener is
  Round 6 work. Round 5 emits acting-user toasts through `notify`.
- **Legacy issue rows** without `scope_ward_id` are not returned by a
  coordinator's ward query. They remain visible to their raiser and to admin.
- **Backfill** of pre-Round-5 assignments: none. The mapper reads both shapes.

## 7. Verification

- `npx tsx scripts/check-campaign-scope.ts` — 32 assertions covering zone
  vocabulary, zone→LGA cascade, PU coordinator coverage, plain-member authority,
  creation gates and the permission matrix.
- `npx tsc --noEmit` — see the Phase 2 report for the final exit code.
- `npm run build` — see the Phase 2 report.
- Rules were not executed against a live project; the deployed rules need a
  `firebase deploy --only firestore:rules` after review.
