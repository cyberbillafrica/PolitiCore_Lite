# Campaign member baseline projection

## Why plain members need a baseline

Every campaign read in `firestore.rules` is gated on `hasAccess()`, which
resolves a deterministic document in `user_access`:

```
{uid}__{permission}__{scope_type}__{scope_id}
{uid}__{permission}__global
```

Until this round only **coordinators** got any documents written, and only
for the exact scope of their assignment. A plain campaign member had
**zero** documents, so:

- every campaign read was denied — the pages rendered
  `Missing or insufficient permissions`;
- summary spinners never settled, because the reads they awaited never
  resolved.

Coordinators were half-provisioned too: they had their own scope but no
`view_activities` at the LGA, zone or state above them, which is exactly
what the dashboard and *My Area* aggregate over.

The baseline closes both gaps. It is **additive**: a coordinator holds
the baseline *plus* their coordinator grants.

## The 9 documents

For a member registered at `polling_unit_id = <pu>`, `ward_id = <ward>`,
`lga_id = <lga>` (zone `<zone>` derived from the LGA):

| # | Document | Enables |
|---|---|---|
| 1 | `view_activities__polling_unit__<pu>` | activities raised in their own PU |
| 2 | `view_activities__ward__<ward>` | activities raised at their ward |
| 3 | `view_activities__lga__<lga>` | activities raised at their LGA |
| 4 | `view_activities__senatorial_zone__<zone>` | activities raised at their zone |
| 5 | `view_activities__state__enugu-state` | activities raised state-wide |
| 6 | `view_members__polling_unit__<pu>` | the member directory of their PU and the coordinator list |
| 7 | `view_assignments__polling_unit__<pu>` | assignments targeted at their PU |
| 8 | `submit_field_report__polling_unit__<pu>` | submitting a report against an assignment |
| 9 | `report_issue__polling_unit__<pu>` | raising an issue for their area |

Documents 1–5 are the cascade-up `view_activities` grants. Documents 6–9
are the member's own-area authority and stay at the PU: a plain member
does not read another PU's members, assignments, reports or issues.

Permission names come from the campaign matrix in
`src/lib/permissions.ts`. Nothing legacy (`manage_documents`,
`send_notice`, `view_analytics`, `view_member_contacts`) and no
`tenant_id` field is ever written.

Every document has the shape:

```
{ user_id, permission, scope_type, scope_id, allowed: true, updated_at }
```

If the LGA is not part of any known senatorial zone the zone grant cannot
be derived and the member gets **8** documents. Guessing a zone would
widen their reads, so it is left out.

## Eligibility

A user is eligible **if and only if all three hold**:

1. `membership_types` contains `campaign_member`
2. `access_role !== "election_officer"`
3. `polling_unit_id`, `ward_id` and `lga_id` are all non-empty

Coordinators **are** eligible — the baseline is additive on top of their
coordinator grants, and it is what gives them the cascade-up
`view_activities` their dashboard needs.

An election officer is excluded even when the account also carries
`campaign_member`: election operations are a separate portal. Admins are
not special-cased — the rules short-circuit on `isAdmin()`, so a
campaign-member admin simply gets the same baseline as everyone else.

An ineligible user is entitled to **no** campaign documents, so every
campaign document is removed (the election projection is preserved).

## Expected document counts

`n` = number of wards in the assigned LGA. Coordinator grants are 12
permissions per target; the baseline contributes 9.

| Role | Documents |
|---|---|
| Plain member | **9** |
| PU coordinator, own PU | 9 + 12 − 5 = **16** (5 baseline PU grants are the same ids) |
| PU coordinator, another PU | 9 + 12 = **21** |
| Ward coordinator, own ward | 9 + 12 − 1 = **20** (`view_activities` at the ward collapses) |
| Ward coordinator, another ward | 9 + 12 = **21** |
| LGA coordinator, own LGA | 9 + 12 × (1 + n) − 2 = **187** for a 14-ward LGA |
| LGA coordinator, another LGA | 9 + 12 × (1 + n) |
| Zone coordinator | 9 + 12 × (wards + LGAs in the zone) − overlaps at the home LGA/ward |
| State coordinator | 9 + 13 global documents = **22** (state adds `manage_members`) |

Two documents always collapse to one when the coordinator's scope
contains the member's own area, because a document id is unique by
`(permission, scope_type, scope_id)`.

Polling units are deliberately **not** enumerated for LGA, zone or state
assignments: every campaign document that can be scoped to a PU also
carries its ward, and the rules fall back to the ward grant. Enumerating
them would turn a zone assignment into thousands of rows.

## Lifecycle — when the projection is written

`syncCampaignAccessForUser()` in `src/lib/firebase/userAccess.ts`
recomputes the **full** expected projection from current state and diffs
it against what is recorded. It never appends.

| Trigger | Where |
|---|---|
| Public signup (`campaign_member`) | `signUpVolunteer()` → `ensureBaselineCampaignProjection()` |
| Admin creates a member | `createMemberByAdmin()` → `syncCampaignAccessForUser()` |
| Organization assignment created | `createOrganizationalAssignment()` |
| Assignment position / scope / status changed | `updateOrganizationalAssignment()` |
| Assignment deleted | `deleteOrganizationalAssignment()` |
| `access_role` changed | `updateMemberAccessRole()` |
| `membership_types` changed | `updateMemberMembershipTypes()` |
| Home area (`lga_id` / `ward_id` / `polling_unit_id`) changed | `updateCampaignMemberProfile()` |

The diff:

```
expected  = computeExpectedCampaignAccess(current state)
delete    = recorded − expected          (this is what removes a stale grant)
write     = expected − recorded
```

"Recorded" is the `access_projection_ids` array on the user's own profile
document. The `user_access` **read** rule is `allow read: if false`, so
the client cannot list the collection to diff itself; the index is how
the app knows what it owns. The migration scripts do not need it — the
Admin SDK reads the collection directly.

A change that fits in one batch is committed as **one atomic batch**, so
there is never a window with zero grants. A zone or state coordinator
projects more documents than Firestore allows in a batch (500): those are
applied in chunks with the **adds first**, so the only possible window is
one with surplus grants, never one with missing ones.

## Rules

The write rule for `user_access` was admin-only, which would have made
the whole lifecycle impossible: a member cannot be an admin. One narrow
clause was added (see `firestore.rules`, `isBaselineAccessPayload()`):

- the document's `user_id` must be the caller;
- `allowed` must be `true`;
- `view_activities` is allowed at the caller's own PU, ward, LGA, zone or
  at `enugu-state`;
- `view_members`, `view_assignments`, `submit_field_report` and
  `report_issue` are allowed **only** at the caller's own polling unit;
- the document id must be exactly derivable from the payload
  (`uid__permission__scope_type__scope_id`), so an id can never disagree
  with its contents;
- deletion is limited to documents whose `user_id` is the caller.

It can never grant a coordinator permission, anything above the caller's
own area, or anything at somebody else's polling unit. The one thing
rules cannot check is the zone↔LGA mapping, so the zone grant is limited
to `view_activities`.

## Migration

```bash
npm run project:campaign-access -- --dry-run   # report only
npm run project:campaign-access                # write baselines
npm run cleanup:grants -- --dry-run            # full diff, report only
npm run cleanup:grants                         # full recompute + cleanup
npm run verify:campaign-access                 # read back and assert
```

`project:campaign-access` only ensures the baseline (and removes every
campaign document from users who are no longer entitled to any).
`cleanup:grants` recomputes the **full** projection, which is what
removes a baseline left at a previous home area.

Both need `serviceAccountKey.json` at the project root and read the
hierarchy from `electoral_data/enugu-state`; they refuse to run when that
document is missing rather than delete grants they cannot resolve.

## Known limitation

Manual edits in the Firebase console cause drift until the next write
through the app (or the next `cleanup:grants` run). The app only deletes
documents it recorded in `access_projection_ids`; a document created by
hand is invisible to it.
