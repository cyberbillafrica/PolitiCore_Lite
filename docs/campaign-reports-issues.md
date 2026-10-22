# Campaign Reports and Issues

Two collections, two **opposite** visibility models. Getting them backwards is
the most likely future regression, so both are stated explicitly here and
enforced in the rules.

| | Reports | Issues |
|---|---|---|
| Direction | **narrow** — no cascade | **cascade up** |
| Sees it | submitter, assignment creator, admin | raiser, every covering coordinator, admin |
| Higher coordinators | **do not** see it | **do** see it |

---

## 1. Reports

Collection: `campaign_field_reports` (the existing collection — Round 5 extends
it rather than introducing a second report system).

### Shape

```ts
{
  id,
  assignment_id,
  assignment_creator_id,   // snapshot, so the read rule needs no get()

  submitted_by,
  submitted_at,

  title,
  content,                 // mirrored into `description` for old readers
  status: "submitted" | "approved" | "rejected",

  reviewed_by?, reviewed_at?, review_notes?,

  scope_level, scope_id,   // reporter's scope at submission time
  scope_snapshot?: {
    level, scope_id, lga_id?, ward_id?, polling_unit_id?
  },

  // Legacy names kept for the rules / old rows:
  scope_type, created_at, updated_at
}
```

Legacy `accepted` → `approved`, `returned` → `rejected`.

### Submitting

- Only an assignment the member is **targeted by** can receive a report:
  `assigned_to_user == uid` or the member's scope sits inside
  `assigned_to_scope`.
- `assignment_creator_id` is snapshotted from the assignment so the creator's
  read rule can be evaluated without a cross-document `get()`.
- The reporter's scope is snapshotted for admin filtering.
- For `per_person` assignments, `markCompletionSubmitted()` is called after a
  successful submit so the creator's completion list updates.

### Reviewing

- The assignment's creator approves or rejects (admin may override).
- Approval calls `closeAssignmentIfComplete()`; the assignment closes when
  every completion is approved.

### Visibility (exact)

```
submitter == uid  OR  assignment_creator_id == uid  OR  admin
```

That is the complete list. There is **no** scope-based read, and adding one
would be a regression.

### Admin filter

`getAllCampaignReports({ level, wardIds, pollingUnitIds })` narrows in memory
using the reporter's `scope_snapshot`, because a report's stored scope can be a
polling unit while the admin filters by ward.

## 2. Issues

Collection: `issues`.

### Shape

```ts
{
  id,
  raised_by, raised_at,
  title, description,
  scope_level, scope_id,
  scope_ward_id,            // read scoping (ward of the issue's scope)

  status: "open" | "acknowledged" | "resolved",

  acknowledged_by?, acknowledged_at?,
  resolved_by?, resolved_at?, resolution_notes?,

  issue_type?, priority?, location?,

  // Legacy names kept for the rules / old rows:
  reported_by, scope_type, created_at
}
```

The legacy six-state vocabulary folds into three: `reported` / `assigned` /
`in_progress` → `open`, `acknowledged` → `acknowledged`,
`resolved` / `closed` → `resolved`.

### Raising

Any member may raise an issue. The scope defaults to their effective authority
(their coordinator scope, or their registered PU for a plain member), and
`scope_ward_id` is stamped so cascade-up reads stay one query per ward.

### Visibility (cascade up)

- The raiser sees their own issues (`getMyCampaignIssues`, which also queries
  the legacy `reported_by` field).
- A coordinator sees every issue at their scope and below
  (`getIssuesInScope`).
- Admin sees everything.

`getIssuesInScope` runs three queries per ward chunk:

1. exact `scope_type` + `scope_id` matches (covers legacy rows with no stamp)
2. `scope_type == "ward"` and `scope_id in [wards]`
3. `scope_ward_id in [wards]` (covers PU-scoped rows)

### Acting

- Any coordinator whose scope covers the issue may acknowledge or resolve it;
  admin may override.
- The natural responder is the coordinator with the smallest covering scope,
  but the matrix does not restrict action to them.
- `resolution_notes` is optional and shown to the raiser on resolve.

## 3. Firestore rules

### Reports (R4)

```
allow read: if isSignedIn() && resource.data.submitted_by == request.auth.uid;
allow read: if isAdmin();
allow read: if isSignedIn() && resource.data.get("assignment_creator_id", "") == request.auth.uid;
allow read: if isSignedIn() && hasAccess("review_field_report", resource.data.scope_type, resource.data.scope_id);
```

The `review_field_report` read is retained for backwards compatibility with
coordinators reviewing pre-Round-5 field reports; new reports are governed by
the three narrow reads above.

### Issues (R5)

```
allow read: if isAdmin();
allow read: if isSignedIn() && resource.data.get("raised_by", "") == request.auth.uid;
allow read: if isSignedIn() && resource.data.reported_by == request.auth.uid;
allow read: if isSignedIn() && hasAccess("manage_issue", resource.data.scope_type, resource.data.scope_id);
allow read: if isSignedIn()
  && resource.data.get("scope_ward_id", "") != ""
  && hasAccess("manage_issue", "ward", resource.data.get("scope_ward_id", ""));
```

The last clause is what makes cascade-up work: a ward coordinator holds
`manage_issue` for every ward inside their scope, so a PU-scoped issue in one of
those wards is readable without a per-PU index document.

## 4. Empty states

Both pages use language, not zeroes:

- "No reports yet" / "No reports received yet"
- "No assignments to report against yet"
- "No issues reported yet"

## 5. Known limitations

- Pre-Round-5 issues with no `scope_ward_id` are not returned by a coordinator's
  ward query. They remain visible to their raiser and to admin.
- Pre-Round-5 reports with no `assignment_id` are not assignment-linked and are
  visible to submitter + admin only.
- Cross-user notifications (notify the assignee, the creator, the responder) are
  **deferred to Round 6**. Round 5 emits acting-user toasts through `notify`.
