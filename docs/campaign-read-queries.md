# Campaign read queries

**Every campaign list read must constrain the fields its security rule
reads.** If it does not, Firestore rejects the whole query — not the
documents outside the caller's scope.

## Why an unfiltered read fails

Firestore validates a list query against the rules *before* it streams
results, and it must be able to prove that **every** document the query
could return is readable. `getDocs(collection(db, "campaign_activities"))`
puts no constraint on any field, so the rule

```
allow read: if isSignedIn()
  && hasAccess("view_activities", resource.data.scope_type,
                                   resource.data.scope_id);
```

cannot be proven for an arbitrary document. The first document outside
the caller's scope makes the whole read fail with *"Missing or
insufficient permissions"* — this was the Round 7 campaign outage for
plain members.

Election pages never had the bug because Round 2 already filtered them
(`getElectionResultsByWardAndPollingUnit`).

## The pattern

Each query is a conjunction that pins the two fields the `user_access`
rule hashes into a document path:

```ts
query(
  collection(db, "campaign_activities"),
  where("scope_type", "==", "ward"),          // typed
  where("scope_id", "in", ["nkanu-west-ward-01"]), // proven by the grant
)
```

The ids come from `src/lib/campaign-read-scope.ts`, never from a page:

| Helper | Returns |
|---|---|
| `baselineActivityScopes(area)` | own PU, ward, LGA, zone, `enugu-state` |
| `baselinePollingUnitScopes(area)` | own PU only |
| `coordinatorReadScopes(scope)` | the assignment's own scope, its LGAs, its wards, or `global` for a state scope |
| `activityReadScopes(area, scope)` | baseline + coordinator |
| `groupScopeQueries(scopes)` | `{ scope_type, scope_ids[] }`, with `global` split out |
| `chunkIds(ids)` | 30-value `in` chunks |

`global` means the rule's `hasGlobalAccess()` branch is query-independent,
so an unfiltered read is legal — that is admin and state-scoped
coordinators only.

## Per collection

| Collection | Query | Rule that makes it provable |
|---|---|---|
| `campaign_activities` | `scope_type` + `scope_id in …` for every held scope | `campaign_activities` read via `hasAccess("view_activities", …)` |
| `campaign_activities` (PU rows) | `scope_type == "polling_unit"` + `scope_ward_id in <coordinator wards>` | the `scope_ward_id` clause added in Round 7 |
| `campaign_assignments` | `assigned_to_user`, `assigned_to`, `created_by`, `assigned_by` equality to the uid | the four assignee/creator clauses |
| `campaign_assignments` (scope) | `scope_type` + `scope_id`, or `target_ward_id in <authority wards>` | `hasAccess("view_assignments", …)` |
| `campaign_field_reports` | `submitted_by == uid`, `assignment_creator_id == uid` | submitter + creator clauses |
| `issues` | `raised_by`/`reported_by == uid`; `scope_type`+`scope_id`; `scope_ward_id in <wards>` | raised-by and cascade-up `manage_issue` clauses |
| `organizational_assignments` | `user_id == uid` (own) or `scope_type`+`scope_id`+`status` (positions in scope) | own-record and `hasAccess("view_members", …)` clauses |
| `users` | `membership_types array-contains "campaign_member"` + `ward_id`/`polling_unit_id` | `users` is readable by any signed-in account; the filter is the *page's* scope, not a rules requirement |
| `campaign_assignments/{id}/completions` | only fetched by the assignment's creator/admin | the completions read clause |

`getAllCampaignActivities()`, `getAllCampaignAssignments()` and
`getAllCampaignReports()` are admin/global-only and are documented as
such in their modules.

## Adding a new campaign query

1. Start from the rule: which field does it compare against the
   document? That field must appear in the `where()`.
2. Get the scope ids from `campaign-read-scope.ts`. Do not build a
   `where("scope_type", "==", level)` from a page.
3. If the query touches a new field, add a rule clause **and** an
   emulator test in `tests/rules/` in the same change.
4. Add the composite index to `firestore.indexes.json` (equality on two
   fields always needs one).
5. Wrap the read in `campaignRead({ collection, filter }, …)` so a
   failure names the query in the console.

## Composite indexes

`firestore.indexes.json` (deploy separately with
`firebase deploy --only firestore:indexes`):

```json
{
  "indexes": [
    { "collectionGroup": "campaign_activities", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "scope_type", "order": "ASCENDING" },
        { "fieldPath": "scope_id", "order": "ASCENDING" }
      ] },
    { "collectionGroup": "campaign_activities", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "scope_type", "order": "ASCENDING" },
        { "fieldPath": "scope_ward_id", "order": "ASCENDING" }
      ] },
    { "collectionGroup": "campaign_assignments", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "scope_type", "order": "ASCENDING" },
        { "fieldPath": "scope_id", "order": "ASCENDING" }
      ] },
    { "collectionGroup": "issues", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "scope_type", "order": "ASCENDING" },
        { "fieldPath": "scope_id", "order": "ASCENDING" }
      ] },
    { "collectionGroup": "organizational_assignments", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "scope_type", "order": "ASCENDING" },
        { "fieldPath": "scope_id", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ] },
    { "collectionGroup": "users", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "membership_types", "arrayConfig": "CONTAINS" },
        { "fieldPath": "ward_id", "order": "ASCENDING" }
      ] },
    { "collectionGroup": "users", "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "membership_types", "arrayConfig": "CONTAINS" },
        { "fieldPath": "polling_unit_id", "order": "ASCENDING" }
      ] }
  ]
}
```

The emulator does **not** enforce indexes, so a green test suite does not
prove they exist in production. Create them before deploying the rules.

## Known limitation

`campaign_activities` written before Round 7 have no `scope_ward_id`, so a
coordinator sees those PU rows only through their own PU grant (as
before). New writes stamp the field; a backfill is a separate task.
