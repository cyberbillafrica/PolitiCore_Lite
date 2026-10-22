# Round 5 — Campaign Scoping Audit (Phase 1)

Status: **AUDIT ONLY — no code changed.** Every claim below was read from the
current tree (`politicore_lite/`, clean working tree at `897a333`).

Scope of the audit: the seven campaign pages, their data modules, the
organizational assignment model, the permission helpers, the Admin Coordination
picker, and the Firestore rules that gate each collection.

---

## 0. The authoritative model as it actually exists

### 0.1 Scope vocabulary (`src/types/index.ts`)

```ts
export type ScopeType =
  | "polling_unit" | "ward" | "lga" | "senatorial_zone" | "state" | "campaign";
```

There is **no `"zone"`** member. The election engine, the constituency
reference, the seed data and the stored `election_contests` documents all use
**`"senatorial_zone"`**:

- `src/lib/firebase/election-seed.ts:194` — `scope_type: "senatorial_zone"`,
  `scope_id: "enugu-east"`.
- `src/data/constituencies.ts:50,63,76` — the three zones, aliases
  `enugu-east`, `enugu-north`, `enugu-west`.
- `src/lib/permissions.ts` — `isScopeDescendant()` switches on
  `"senatorial_zone"`.

**Decision (A1 below): adopt `senatorial_zone`. Do not introduce `"zone"`.**

### 0.2 Geographic id vocabulary (verified against the electoral dataset)

| Level | id shape | example |
|---|---|---|
| State | `enugu-state` | `enugu-state` |
| Zone | `enugu-east` \| `enugu-north` \| `enugu-west` | `enugu-north` |
| LGA | `<lga>` (no `-lga` suffix) | `nkanu-west` |
| Ward | `<lga>-ward-NN` | `nkanu-west-ward-03` |
| PU | `<lga>-ward-NN-pu-NNN` | `nkanu-west-ward-03-pu-001` |

The prompt's examples (`enugu-north-zone`, `nkanu-west-lga`) do **not** match
the dataset. The picker must emit the ids above.

**Known collision:** `enugu-north`, `enugu-east` are *both* zone slugs and LGA
ids. `scope_type` is the only disambiguator, which is exactly why
`PermissionScope` is `{ scope_type, scope_id }` and not a bare id.

### 0.3 `organizational_assignments` document shape (current)

```ts
interface OrganizationalAssignment {
  id: string;
  user_id: string;
  position: OrganizationalPosition;
  scope_type: ScopeType;
  scope_id: string;
  status: "active" | "inactive" | "suspended" | "expired";
  assigned_by: string;
  assigned_at?; starts_at?; ends_at?; created_at?; updated_at?;
}
```

`OrganizationalPosition` (current):

```ts
"campaign_member" | "ward_coordinator" | "lga_coordinator"
| "zone_coordinator" | "state_coordinator"
| "campaign_manager" | "council_chairman"
```

- Written only by `createOrganizationalAssignment()` /
  `updateOrganizationalAssignment()` / `deleteOrganizationalAssignment()`
  (`src/lib/firebase/organizationalAssignments.ts`).
- Each write also maintains the `user_access` security index — but **only for
  `view_election_results`** (`src/lib/firebase/userAccess.ts`).
- `SCOPE_GRANTING_POSITIONS` there excludes `campaign_member`, and
  `resolveAccessTargets()` cannot expand a `senatorial_zone` (no zone→LGA
  membership in `electoral_data` except the static reference table).

**No `pu_coordinator` exists anywhere in the tree** (`grep -rn pu_coordinator
src/ firestore.rules docs/` → 0 hits). No `polling_unit` position is
assignable in the UI either: the coordination page's `POSITIONS` array
(`coordination/page.tsx:91`) has no PU-level entry, though `SCOPE_TYPES`
does include `polling_unit`.

### 0.4 Scope helpers that already exist (`src/lib/permissions.ts`)

| Helper | Line | Behaviour |
|---|---|---|
| `getActiveAssignments` | 20 | filters `status === "active"` |
| `isCampaignMember` | 29 | `membership_types` includes `campaign_member` |
| `isCampaignMemberAdmin` | 43 | admin **and** campaign member |
| `getCampaignAssignments` | 56 | position whitelist |
| `hasPosition` | 70 | position match on active rows |
| `isScopeDescendant(source, target, lgas?)` | 106 | the hierarchy resolver; reads `lgasData`, falls back to id-prefix matching |
| `assignmentCoversScope(assignment, scope?, lgas?)` | 211 | exact match **or** `isScopeDescendant` |
| `hasExplicitGrant` | 241 | explicit deny beats grant |
| `positionHasPermission` | 275 | position → permission matrix |
| `hasPermission(context, permission, scope?)` | 379 | admin → grants → position |
| `isCampaignCouncilMember` | 512 | awareness helper |

So the *primitives* required by Round 5 exist. What is missing is a
**campaign-side read-scope resolver** (assignment → the set of
wards/PUs/members it covers) and the assignment-completion model.

Two concrete defects in `positionHasPermission` that this round must fix:

1. `campaign_member` is granted `"create_activity"` and `"assign_task"`
   (`permissions.ts:288-300`). The spec says plain members create neither
   activities nor assignments.
2. There is no `pu_coordinator` case at all, so a PU-scoped coordinator
   currently falls to `default: return false` for every permission.

Also note `hasPermission()` treats a plain `access_role === "admin"` as
universally privileged **except** the four campaign-activity permissions,
which additionally require `isCampaignMember(profile)`. Today that means an
admin who is not a campaign member cannot even *read* the Activities page.

### 0.5 Admin Coordination scope picker — current state

`src/app/portal/campaign/coordination/page.tsx`

- Position: `<SelectField>` over `POSITIONS` (7 values, no PU).
- Scope type: `<SelectField>` over `SCOPE_TYPES` (6 values).
- **Scope id: a raw `<TextField label="Scope ID">` (lines 1071–1076).**
  The admin must type `nkanu-west-ward-03` from memory. There is no cascade,
  no search, no name lookup, no duplicate disambiguation, and no feedback
  showing whether the id resolved to anything.
- The permission-grant form (lines 1290–1306) and the grant editor
  (lines 1431–1453) use the same raw-id text field.

**Answer to audit question 5: neither cascading nor searchable — free text.**

### 0.6 Notifications — already migrated

- `sonner@^2.0.8` is in `package.json`; `<Toaster />` is mounted in
  `src/app/layout.tsx:45`.
- `src/lib/notify.ts` is the single notification layer
  (success/error/warning/info, per-variant durations).
- `grep -rn "window.alert\|window.confirm" src/` → **0 hits**.
- Every campaign page already calls `notify.*` instead of inline banners.

Round 5 work here is therefore **coverage, not installation**: the pages still
carry dead `error` / `successMessage` state and `console.error` pairs that no
longer render, and no campaign mutation currently emits a success toast on
every path.

---

## 1. Per-page gap report

### 1.1 Campaign Dashboard — `/portal/dashboard` (campaign variant)

Renders `src/components/dashboard/CampaignDashboard.tsx` (routing in
`src/app/portal/dashboard/page.tsx`: admin → `AdminDashboard`, EO →
`ElectionOfficerDashboard`, campaign/social membership → variant).

| Aspect | Current |
|---|---|
| Reads | `useAuth()` only (`profile`, `assignments`, `accessLoading`). `useElectoralLookup()` for registered LGA/ward/PU labels. |
| Live data | **None.** No query to members, assignments, activities, reports or issues. |
| Scope logic | `getPrimaryOrganizationalScope(assignments)`; `buildScopeSummary()` (line 899) prints the primary scope; `getOrganizationalAuthority()` (line 948) is a hardcoded position set (`ward/lga/zone/state/campaign_manager/council_chairman`) — no scope, no `pu_coordinator`. |
| Numbers | "Members / Volunteers / Polling Units / Coordinators" tiles are literal `"—"`. |
| Cards | 8 static nav cards, 2 management links gated by the position set, 4 election links. |

| Page | Current state | Correct per spec | Delta |
|---|---|---|---|
| Dashboard | Assignment-identity card + static nav; all counts are `—`; no queries | Plain member: own ward/PU, own assignment open/completed counts, recent PU activities, own issues, PU member count. Coordinator: position + scope label, members in scope, PUs in scope, open assignments in scope, pending reports received, open issues in scope, recent activities in scope | **Missing** — needs a scope-aware summary data layer (`useCampaignOverview`) and both render variants. `getOrganizationalAuthority` must derive authority from `assignmentCoversScope`, not a position set. PU coordinators are invisible. |

### 1.2 My Area — `/portal/campaign/area`

| Aspect | Current |
|---|---|
| Reads | `useAuth().profile`; **a local stub** `useMyOrganizationalAssignments()` at line 34 that unconditionally returns `{ assignments: [], loading: false, error: null }`. |
| Consequence | The page **always** renders the "No organizational assignment yet" branch. It has never shown real data. |
| Scope logic | Only `formatScopeType` / `getPrimaryOrganizationalScope` on the (always empty) array. `Profile` ward/PU labels come from `useElectoralLookup()` and do render. |
| Stats | "Members / Volunteers / Polling Units / Coordinators" all `—`. |
| Actions | 4 static links (members, assignments, activities, reports). No create actions, no scope filter. |

| Page | Current state | Correct per spec | Delta |
|---|---|---|---|
| My Area | Dead stub → always "no assignment"; static tiles; registered-area card works | Plain member: PU stats (PU members, activities, own assignments) read-only. Coordinator: scope stats + quick actions (Create Activity if allowed, Create Assignment if allowed, View Reports Received, View Issues) + subordinate level filter. Real empty states ("No members yet") | **Wrong** (stub hook). Needs: real assignments from `useAuth`/`useOrganizationalAssignments`, scope stats, permitted-action cards, level filter, honest empty states. |

### 1.3 Members — `/portal/campaign/members`

| Aspect | Current |
|---|---|
| Reads | `useOrganizationalAssignments()` → `getActiveOrganizationalAssignments(userId)`; `useScopedCampaignMembers(primaryAssignment)` → `getScopedCampaignMembers()`. |
| Scope support | `campaign`/`state` → all members; `polling_unit` → `polling_unit_id ==`; `ward` → `ward_id ==`; `lga` → resolve the LGA's wards then `ward_id in [chunks of 30]`. **`senatorial_zone` → `scopeSupported: false`** with a yellow "Geographic scope expansion required" banner. |
| Admin | **No admin branch.** An admin typically holds no assignment, so the page shows "No organizational assignment" instead of the statewide directory. |
| Fields | name, email, phone, ward/PU labels, membership; **no position column, no coordinator list**. |
| Search | name / email / phone only. No ward, PU, role or position filter. |
| Detail page | `members/[id]` loads **any** user by id via `getCampaignMemberById()` with no scope check, and edits role/assignments/grants when `hasPermission` allows |

| Page | Current state | Correct per spec | Delta |
|---|---|---|---|
| Members | Scope-correct for PU/ward/LGA; zone unsupported; admin sees nothing; no position info; no filters | Plain member: own PU only, read-only. Coordinator: scope + below, read-only, **with coordinators in scope listed by position and sub-scope**. Admin: everyone + filters (name, ward, PU, role, position) | **Half-implemented.** Needs zone expansion, a plain-member self-PU path, an admin path, coordinator sub-list, position resolution from `organizational_assignments`, and detail-page scope guard. |

### 1.4 Assignments — `/portal/campaign/assignments`

| Aspect | Current |
|---|---|
| Model | `CampaignAssignment` in `src/lib/firebase/campaignAssignments.ts`: `assigned_to` (uid), `assigned_by`, `scope_type`, `scope_id`, `priority`, `status: not_started\|in_progress\|submitted\|under_review\|completed\|overdue`, `due_date`, `location`, `evidence_url`. **Single-assignee only.** No `assigned_to_scope`, no `completion_mode`, no completions subcollection. |
| View | `getMyCampaignAssignments(uid, email)` + (`isAdmin` → all) or `getScopedCampaignAssignments(primaryScope)` which matches **exact** `scope_type`+`scope_id` only — no descendant expansion. |
| Create | Form requires `assigned_to` uid **and** `scope_id` typed by hand. No scope-targeted mode. No coverage check that the creator may assign at that scope. |
| Approve | None. No per-person completion, no approval, no report linkage. |
| Filters | free-text search only. |

| Page | Current state | Correct per spec | Delta |
|---|---|---|---|
| Assignments | Individual-only, exact-scope reads, manual id entry, no completion/approval | `assigned_to_user?` / `assigned_to_scope?` / both; `completion_mode`; per-person completions subcollection; creator-approval flow; scope-cascading reads; coverage-checked creation; filters (status, due, target type, my role) | **Missing / wrong model.** Largest piece of work in the round. |

### 1.5 Activities — `/portal/campaign/activities`

| Aspect | Current |
|---|---|
| Reads | admin → `getAllCampaignActivities()`; everyone else → `getCampaignActivitiesForAssignments(assignments)`. |
| Scope logic | The data layer queries the **exact** `scope_type`+`scope_id` of each active assignment. It deliberately does **not** expand downward (comment at `campaignActivities.ts:60`). So a ward coordinator does **not** see PU-scoped activities in their own ward, and a state coordinator sees only `state`-scoped rows. |
| Create | `hasPermission("create_activity")` — which plain `campaign_member` also has. Non-admin picks one of their own assignments as the scope; admin types a raw `Scope ID` (`adminScopeId`, line 564) next to a scope-type select. |
| Filters | none. Admin sees all rows unfiltered; no State/Zone/LGA/Ward/PU select. |

| Page | Current state | Correct per spec | Delta |
|---|---|---|---|
| Activities | Exact-scope reads (no cascade-down); plain members can create; admin types raw ids; no admin scope filter | Visible when member scope ⊆ activity scope (state activity → everyone; ward activity → ward + its PUs; PU activity → that PU). PU coord and above may create; plain members may not. Admin may pick any level via the hybrid picker, and may filter the list by scope | **Wrong** semantics both ways (no downward expansion, wrong create permission) + picker + filter. |

### 1.6 Reports — `/portal/campaign/reports`

| Aspect | Current |
|---|---|
| Model | `campaign_field_reports`: `submitted_by`, `report_type` (activity/community/mobilization/meeting/field/other), `title`, `description`, `scope_type`, `scope_id`, `participants`, `issues`, `community_feedback`, `requests`, `follow_up_required`, `evidence_url`, `status: submitted\|under_review\|accepted\|returned`, `reviewed_by`, `review_comment`. **No `assignment_id`** — a report cannot reference an assignment. |
| View | `getMyCampaignReports(uid)` always; plus `getScopedCampaignReports(primaryScope)` when `hasPermission("review_field_report")` — again **exact scope only**. |
| Admin | No `getAllCampaignReports()`. An admin without an assignment sees only reports they personally submitted. |
| Approve | No approve/reject action exists; `status`/`reviewed_by` are never written. |
| Filters | none. No scope select. |

| Page | Current state | Correct per spec | Delta |
|---|---|---|---|
| Reports | Free-form field reports, no assignment link, no review actions, cascade-up-ish read, admin sees nothing statewide | Submission against an assignment; visible to submitter + assignment creator + admin only (not cascade-up); approve/reject by creator (admin override); admin scope filter | **Wrong model.** Needs assignment linkage, review actions, a creator-scoped query, admin universal read + filter. |

### 1.7 Issues — `/portal/campaign/issues`

| Aspect | Current |
|---|---|
| Model | collection `issues`: `title`, `description`, `issue_type`, `priority`, `status: reported\|acknowledged\|assigned\|in_progress\|resolved\|closed`, `scope_type`, `scope_id`, `reported_by`, `assigned_to`, `location`, `evidence_url`, `resolution_notes`. |
| View | `getScopedCampaignIssues(primaryAssignment)` → **exact** `scope_type`+`scope_id`. A plain member with a `campaign_member` assignment (PU scope) therefore sees only PU-scoped rows, **not issues they raised** unless the scope matches, and coordinators do **not** see their descendants. |
| Actions | **None.** `canManage` only renders a "Management View" pill (line 565). No acknowledge, no resolve, no assignment. |
| Admin | No branch. No universal read, no scope filter. |
| Raise | `IssueForm` stamps the primary assignment's scope. |

| Page | Current state | Correct per spec | Delta |
|---|---|---|---|
| Issues | Exact-scope read, so cascade-up is broken; no raise-own list; no acknowledge/resolve | Raiser sees own issues; any coordinator whose scope covers the issue sees it (cascade **up**); plain member sees only own; admin sees all. Any covering coordinator (or admin) may acknowledge/resolve | **Wrong.** Needs a descendant-expanded query, an own-issues merge, action endpoints, and admin view. |

### 1.8 Admin Coordination — `/portal/campaign/coordination`

| Aspect | Current |
|---|---|
| Reads | `users`, `organizational_assignments`, `permission_grants` (admin only). |
| Writes | assignment CRUD, grant CRUD, access-role change, membership-type change. |
| Picker | raw text `Scope ID` (see §0.5). |
| Positions | 7; no `pu_coordinator`. |
| Feedback | `notify.*` throughout. |

| Page | Current state | Correct per spec | Delta |
|---|---|---|---|
| Coordination | Raw-id text field; 7 positions | Cascading + searchable hybrid picker; 5 coordinator positions incl. `pu_coordinator`; resolved id shown as small gray text below the label | **Missing picker + position.** |

---

## 2. Cross-cutting data-model mismatches

1. **`campaign_assignments` shape ≠ spec.** Legacy `assigned_to`/`assigned_by`
   plus `priority`/`status`/`evidence_url`. Spec wants
   `created_by`, `assigned_to_user`, `assigned_to_scope`,
   `completion_mode`, `status: open|closed`, and a `completions`
   subcollection. There is existing stored data in the legacy shape.
2. **`campaign_field_reports` ≠ `campaign_reports`.** Different collection
   name, different status vocabulary, no `assignment_id`.
3. **Issues vocabulary** is `reported|acknowledged|assigned|in_progress|resolved|closed`
   vs spec's `open|acknowledged|resolved`.
4. **Activities status/type** is richer than the spec's field list but
   compatible; the real mismatch is the *absence* of a `scheduled_at` and the
   presence of `date` + `start_time`.
5. **`user_access` projection covers only `view_election_results`.** The rules
   call `hasAccess("create_activity" | "submit_field_report" | "report_issue" |
   "view_activities" | "manage_activity" | "review_field_report" |
   "manage_issue", scope_type, scope_id)` — and **nothing ever writes those
   documents**. Net effect today: every non-admin campaign write
   (activity create, report submit, issue raise) is denied by the rules even
   though the UI offers it. This is the single most important rules finding.
6. **`/users` read is `if isSignedIn()`** (`firestore.rules:341`), so any
   signed-in account can read every profile regardless of scope. The Members
   page's scoping is UI-only.
7. **`campaign_assignments` read rule** only allows `assigned_to == uid` (plus
   admin). Coordinators cannot read assignments targeted at their scope, and
   `assigned_to_scope` documents would be invisible to everyone but admin.
8. **`organizational_assignments` read rule** allows admin + the assignee
   only. Listing "coordinators in my scope" (Members page) is impossible for a
   non-admin coordinator.
9. **`senatorial_zone` has no expansion path** anywhere: not in
   `getScopedCampaignMembers`, not in `resolveAccessTargets`. Zone coordinators
   are structurally unsupported even though the position and scope type exist.

---

## 3. Ambiguities in the brief, and the resolution

> **Human-approved 2026-10-21** for A5 (additive assignment migration, legacy
> fields kept), A6 (extend `campaign_field_reports`), and A1/A4 (zone ids
> `enugu-east` / `enugu-north` / `enugu-west`). All other rows below stand as
> written.

| # | Ambiguity | Resolution |
|---|---|---|
| A1 | `SCOPE_TYPES` "recommended" `"zone"`; spec's example id `enugu-north-zone` | **APPROVED — use `ScopeType` as-is:** **`senatorial_zone`**, ids `enugu-east` / `enugu-north` / `enugu-west`. `assignmentCoversScope` then works with zero changes. |
| A2 | Position named `zonal_coordinator` in the brief vs `zone_coordinator` in code | Keep the stored value **`zone_coordinator`**; label it "Zonal Coordinator" in the UI only. Renaming the union would break `getCampaignAssignments`, `useOrganizationalAssignments` and existing rows. |
| A3 | "No position → plain member; My Area = own PU" vs the existing `campaign_member` assignment row | `campaign_member` **is** the plain-member marker. Effective self-scope = registered PU (`profile.polling_unit_id`), falling back to registered ward when no PU is set. No synthetic assignment row is created. |
| A4 | Spec id examples `nkanu-west-lga`, `nkanu-west-ward-03-pu-001` | Dataset uses `nkanu-west` and `nkanu-west-ward-03-pu-001`; ward ids **do** match the example. Emit dataset ids verbatim. |
| A5 | Assignment doc renames fields (`assigned_to` → `assigned_to_user`, `assigned_by` → `created_by`) | **APPROVED — Additive migration**: new fields written alongside legacy ones; mapper accepts either (`assigned_to_user ?? assigned_to`). No destructive rewrite, no backfill script, existing rows keep working. |
| A6 | Reports: new `campaign_reports` collection vs existing `campaign_field_reports` | **APPROVED — extend `campaign_field_reports`** (rules and two pages already reference it): **add** `assignment_id`, `assignment_creator_id`, `scope_snapshot`, review fields. No second report collection. |
| A7 | Issue statuses `open|acknowledged|resolved` | Map: `open` ⇐ stored `reported`/`assigned`/`in_progress`; keep the richer stored set, render a 3-state badge, and accept both when filtering. |
| A8 | Assignment statuses `open|closed` | Store `open`/`closed` on new documents; the mapper folds legacy `not_started…overdue` into `open` unless `completed`. Completion state lives on the per-person records, not on the assignment status. |
| A9 | "Admin can create any assignment" — is an admin required to hold a campaign membership? | Campaign pages grant admins **universal read and write** regardless of membership. The existing `isCampaignMember`-gated activity permissions stay for the *social* admin dashboard, but the campaign pages will short-circuit on `access_role === "admin"`. |
| A10 | Cross-user notifications (assignment created → assignee, etc.) | **Deferred.** No notifications collection exists; adding one plus a listener is a separate round. This round emits acting-user toasts via `notify`, and writes no notification documents. Stated again in the Phase 2 report. |

Additional ambiguity found during the audit:

| # | Ambiguity | Resolution |
|---|---|---|
| A11 | Does "Reports visible to assignment creator" apply to legacy free-form reports that have no assignment? | Legacy reports with no `assignment_id` stay visible to submitter + admin only. Creator-visibility applies to assignment-linked reports. |
| A12 | Should the coordination page's permission-grant scope picker also use the hybrid picker? | Yes — same component, since grants are scope-keyed. Low cost, keeps the vocabulary consistent. |

---

## 4. Firestore rules gaps — proposed diffs for approval (not applied)

These are proposals only. Nothing in `firestore.rules` was touched.

**(R1) `user_access` must carry campaign permissions.**
Without this, every non-admin campaign write is denied. Proposed change:
extend the projection in `src/lib/firebase/userAccess.ts` to write
`user_access` documents for the campaign permissions a position implies
(`create_activity`, `view_activities`, `manage_activity`,
`submit_field_report`, `review_field_report`, `report_issue`,
`manage_issue`, `create_assignment`, `view_assignments`), for the
assignment's own scope **and** every descendant scope (wards for an LGA, PUs
for a ward, wards+PUs for a zone). Rules text is unchanged; only the index
gains rows.

**(R2) Coordinators must read `organizational_assignments` in scope.**

```diff
 match /organizational_assignments/{assignmentId} {
   allow read: if isAdmin()
     || (isSignedIn() && resource.data.user_id == request.auth.uid);
+  // Coordinators may read the assignments of members inside their scope.
+  allow read: if isSignedIn()
+    && hasAccess("view_members", resource.data.scope_type, resource.data.scope_id);
   allow create, update, delete: if isAdmin();
 }
```

**(R3) `campaign_assignments` must be readable by scope targets and creators.**

```diff
 match /campaign_assignments/{assignmentId} {
   allow read: if isAdmin()
     || (isSignedIn() && resource.data.assigned_to == request.auth.uid);
+  allow read: if isSignedIn()
+    && resource.data.created_by == request.auth.uid;
+  allow read: if isSignedIn()
+    && resource.data.assigned_to_scope is map
+    && hasAccess(
+         "view_assignments",
+         resource.data.assigned_to_scope.level,
+         resource.data.assigned_to_scope.scope_id
+       );
+  // Coordinators may create only inside their own scope; rules cannot
+  // evaluate the hierarchy, so the client coverage check plus the
+  // user_access index is the enforcement point.
+  allow create: if isSignedIn()
+    && request.resource.data.created_by == request.auth.uid
+    && hasAccess(
+         "create_assignment",
+         request.resource.data.assigned_to_scope.level,
+         request.resource.data.assigned_to_scope.scope_id
+       );
   allow create, update, delete: if isAdmin();
 }
```

**(R4) Coordinate report reads with the creator, never cascade-up.**

```diff
 match /campaign_field_reports/{reportId} {
   allow read: if isAdmin();
   allow read: if isSignedIn()
     && resource.data.submitted_by == request.auth.uid;
+  allow read: if isSignedIn()
+    && resource.data.assignment_creator_id == request.auth.uid;
   ...
 }
```

(`assignment_creator_id` would be snapshotted on submit so the rule needs no
cross-document `get()`.)

**(R5) Issues: cascade-up read via the `user_access` index.**

```diff
 match /issues/{issueId} {
   allow read: if isAdmin();
   allow read: if isSignedIn()
     && resource.data.reported_by == request.auth.uid;
   allow read: if isSignedIn()
     && hasAccess("manage_issue", resource.data.scope_type, resource.data.scope_id);
+  // Any member of the same scope may see the issue too (raise-and-follow).
+  allow read: if isSignedIn()
+    && hasAccess("report_issue", resource.data.scope_type, resource.data.scope_id);
   ...
 }
```

Because R1 projects `manage_issue`/`report_issue` down to every descendant
scope, a ward coordinator's index carries an entry for each PU in their ward,
so `hasAccess()` succeeds for a PU-scoped issue without any new rules
function.

**(R6) `/users` stays `if isSignedIn()`.** Narrowing it would break login,
the member directory and the name resolver. Member *visibility* is enforced
in the data layer instead. Flagged as a known, accepted limitation — do not
widen, do not narrow without a separate review.

---

## 5. What "already correct" looks like, precisely

Only three things survive unchanged:

- **Scope primitives** — `isScopeDescendant` / `assignmentCoversScope` are
  correct and will be reused verbatim.
- **Sonner integration** — installed, mounted, centralised in `notify`.
- **PU / ward / LGA member query shape** in `getScopedCampaignMembers` — the
  chunked `ward_id in [...]` approach is the right primitive; it just needs a
  zone path and a self-PU path.

Everything else is either missing (dashboard counts, assignment
completions, review actions, issue actions, hybrid picker, admin scope
filters, `pu_coordinator`), dead (My Area's stub hook), or semantically
inverted (activities not cascading down, issues not cascading up, reports
cascading up when they must not).

---

## 6. Proposed Phase 2 sequence (for approval)

1. **Types + scope resolver.** `pu_coordinator`; `AssignmentScope`,
   `CampaignAssignment` additions, `AssignmentCompletion`, `CampaignReport`,
   `CampaignIssue`; `src/lib/campaign-scope.ts` that turns an assignment into
   `{ wards, pollingUnits }` using `isScopeDescendant` and the electoral
   hierarchy — the one place expansion happens.
2. **`permissions.ts` corrections.** Drop `create_activity`/`assign_task`
   from `campaign_member`; add a `pu_coordinator` case; export
   `getEffectiveScope(profile, assignments)`.
3. **Hybrid scope picker** (`src/components/campaign/ScopePicker.tsx`),
   reused in coordination, member add/edit, assignment create, activity
   create, reports filter, activities filter.
4. **Data layer**: extend `campaignAssignments` (dual-target + completions
   subcollection), `campaign_field_reports` (assignment link + review),
   `campaignIssues` (descendant + own-issues merge + actions),
   `campaignActivities` (descendant expansion + admin scope filter).
5. **Pages** in the order Dashboard → My Area → Members → Assignments →
   Activities → Reports → Issues → Coordination.
6. **Rules diffs R1–R5** applied to `firestore.rules` with the projection
   change. R6 documented as an accepted limitation.
7. **Docs**: `campaign-scoping.md`, `campaign-assignments.md`,
   `campaign-reports-issues.md`, `CHANGELOG-round5.md`.
8. `npm run build` + `npx tsc --noEmit`.

---

## 7. Answer summary for the eight audit questions

1. **What each page renders/reads** — §1, per page.
2. **Scope logic today** — only `getPrimaryOrganizationalScope`, exact-scope
   Firestore equality queries, and a hardcoded position set on the dashboard.
   `isScopeDescendant` is imported by **zero** campaign pages.
3. **`organizational_assignments` shape** — §0.3 (position + scope_type +
   scope_id + status; no PU position; no completions).
4. **Permission helpers** — §0.4 (all primitives exist; two defects).
5. **Admin Coordination picker** — neither cascading nor searchable; raw text.
6. **Page classification** — Dashboard *missing*; My Area *wrong (stub)*;
   Members *half*; Assignments *missing/wrong model*; Activities *wrong
   semantics*; Reports *wrong model*; Issues *wrong*; Coordination *missing
   picker*.
7. **`pu_coordinator`** — does not exist anywhere (0 grep hits).
8. **Data-model mismatches** — §2, nine findings, including the blocking
   `user_access` projection gap that currently denies every non-admin campaign
   write.
