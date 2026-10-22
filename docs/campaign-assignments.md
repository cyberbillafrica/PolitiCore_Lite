# Campaign Assignments

An assignment is campaign work addressed to **one person**, **a geographic
scope**, or **both**.

---

## 1. Document shape

Collection: `campaign_assignments`

```ts
{
  id,
  title,
  description?,
  created_by,              // uid
  created_at,
  updated_at,
  due_at?,                 // ISO string

  assigned_to_user?: string | null,
  assigned_to_scope?: {
    level: "state" | "senatorial_zone" | "lga" | "ward" | "polling_unit",
    scope_id: string,
    role_filter?: OrganizationPosition | null
  } | null,

  status: "open" | "closed",
  completion_mode: "individual" | "per_person",

  priority?: "low" | "medium" | "high" | "urgent",

  created_scope?: { level, scope_id } | null,   // creator's authority
  target_ward_id?: string | null,               // read scoping

  // Legacy fields, still written for older readers:
  assigned_to, assigned_by, scope_type, scope_id, due_date
}
```

### Validation

- At least one of `assigned_to_user` / `assigned_to_scope` must be present.
  `createCampaignAssignment()` throws otherwise.
- Both may be present: the assignment then applies to the user **and** to
  everyone inside the scope.
- `completion_mode` is derived, never supplied:
  - scope target → `per_person`
  - individual only → `individual`

### Legacy compatibility

Documents written before Round 5 carry `assigned_to` / `assigned_by` /
`scope_type` / `scope_id` / `status: not_started…overdue`. The mapper accepts
either shape:

- `assigned_to_user ?? assigned_to`
- `created_by ?? assigned_by`
- a bare `scope_type`/`scope_id` pair is treated as a scope target when the row
  was not addressed to one person
- `completed` folds to `closed`; everything else folds to `open`

No backfill script runs. New writes carry both the new and the legacy fields.

## 2. Completions

For `per_person` assignments, each targeted member has a row at:

```
campaign_assignments/{assignmentId}/completions/{userId}
```

```ts
{
  assignment_id, user_id,
  status: "pending" | "submitted" | "approved" | "rejected",
  submitted_at?, reviewed_at?, reviewed_by?, review_notes?,
  report_id?
}
```

- Rows are seeded `pending` when the assignment is created, for every member
  the scope resolves to (optionally narrowed by `role_filter`).
- `markCompletionSubmitted()` moves one row to `submitted` and links the report.
- `reviewCompletion()` records the creator's decision.
- `closeAssignmentIfComplete()` closes the assignment once **every** row is
  approved; the creator can also close it manually with
  `setAssignmentStatus(id, "closed")`.

Individual assignments have no completion rows — the single report against the
assignment is the completion.

## 3. Creation rules

| Actor | May target |
|---|---|
| Admin | anything |
| Coordinator | their own scope or anything below it |
| Plain member | nothing |

Enforcement is two-layered:

1. **Client** — `canCreateAtScope()` runs before the write and refuses a target
   outside the creator's authority with a toast.
2. **Rules** — creation requires `created_by == uid` and
   `hasAccess("create_assignment", scope_type, scope_id)`, i.e. the creator's
   `user_access` index must cover the target scope.

A coordinator can never assign upward; `assignmentCoversScope()` returns false
for a parent scope.

## 4. Visibility

| Viewer | Sees |
|---|---|
| Assignee | assignments where `assigned_to_user == uid` (or legacy `assigned_to`) |
| Creator | everything they created |
| Coordinator | targets at their scope and below |
| Admin | everything |

Reads are three queries merged by id (`getAssignmentsInScope`):

1. exact `scope_type` + `scope_id` of the viewer's own scope
2. `target_ward_id in [wards the viewer covers]` — covers ward- and PU-scoped
   assignments, chunked at 30 per query
3. the viewer's own assignments and creations (`getAssignmentsForUser`)

## 5. UI

`/portal/campaign/assignments`

- Filters: status, target type (individual / scope), my role (creator /
  assignee), free-text search.
- Create form: title, description, due date, priority, target radio
  (individual / scope / both), member picker, `ScopePicker`, optional role
  filter.
- Row expansion: target, per-person completion list with names resolved in one
  batch (`resolveUserNames`), approve/reject per row for the creator, manual
  close/reopen, delete.
- A targeted member who has not submitted sees a link to the Reports page.

## 6. Firestore rules (R3)

```
match /campaign_assignments/{assignmentId} {
  allow read: if isAdmin() || (isSignedIn() && resource.data.assigned_to == request.auth.uid);
  allow read: if isSignedIn() && resource.data.get("assigned_to_user", "") == request.auth.uid;
  allow read: if isSignedIn() && resource.data.get("created_by", "") == request.auth.uid;
  allow read: if isSignedIn() && hasAccess("view_assignments", resource.data.scope_type, resource.data.scope_id);
  allow read: if isSignedIn()
    && resource.data.get("target_ward_id", "") != ""
    && hasAccess("view_assignments", "ward", resource.data.get("target_ward_id", ""));

  allow create: if isAdmin();
  allow create: if isSignedIn()
    && request.resource.data.get("created_by", "") == request.auth.uid
    && hasAccess("create_assignment", request.resource.data.scope_type, request.resource.data.scope_id);

  allow update, delete: if isAdmin();
  allow update: if isSignedIn() && resource.data.get("created_by", "") == request.auth.uid;

  match /completions/{userId} {
    allow read: if isAdmin() || request.auth.uid == userId
      || (isSignedIn() && get(/databases/$(database)/documents/campaign_assignments/$(assignmentId)).data.get("created_by", "") == request.auth.uid);
    allow create: if isAdmin()
      || (isSignedIn() && get(...).data.get("created_by", "") == request.auth.uid);
    allow update: if isAdmin() || request.auth.uid == userId
      || (isSignedIn() && get(...).data.get("created_by", "") == request.auth.uid);
    allow delete: if isAdmin();
  }
}
```
