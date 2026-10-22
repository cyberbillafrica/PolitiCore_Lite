# Campaign Scoping

Round 5 aligns every campaign page with the organizational hierarchy the
election engine already uses. There is exactly one scope vocabulary and one
resolver; campaign code does not invent a second.

---

## 1. The hierarchy

```
State (enugu-state)
  └─ Senatorial Zone (enugu-east | enugu-north | enugu-west)
       └─ LGA (17, e.g. nkanu-west)
            └─ Ward (260, e.g. nkanu-west-ward-03)
                 └─ Polling Unit (4,108, e.g. nkanu-west-ward-03-pu-001)
```

Stored with the existing `ScopeType` union:

| Level | `scope_type` | `scope_id` example |
|---|---|---|
| State | `state` | `enugu-state` |
| Zone | `senatorial_zone` | `enugu-north` |
| LGA | `lga` | `nkanu-west` |
| Ward | `ward` | `nkanu-west-ward-03` |
| Polling Unit | `polling_unit` | `nkanu-west-ward-03-pu-001` |

Notes:

- **There is no `"zone"` scope type.** `senatorial_zone` is the stored value
  used by `election_contests`, the constituency reference, and
  `isScopeDescendant()`.
- **No `-zone` or `-lga` suffixes.** Zone ids are the dataset slugs
  (`enugu-east`), which collide with the LGA ids `enugu-east` / `enugu-north`;
  `scope_type` is what disambiguates them.
- `campaign` is a legacy campaign-wide scope. It behaves like `state` and is
  still accepted on read.

## 2. Positions vs access roles

| Concept | Stored on | Values |
|---|---|---|
| Access role | `users.access_role` | `admin` \| `member` \| `election_officer` |
| Position | `organizational_assignments.position` | `state_coordinator`, `zone_coordinator`, `lga_coordinator`, `ward_coordinator`, **`pu_coordinator`**, `campaign_member`, `campaign_manager`, `council_chairman` |

They are deliberately distinct. A position answers *where* a person operates;
an access role answers *what the account can do in the application*.

`pu_coordinator` was added in Round 5. A plain member is represented by a
`campaign_member` assignment (a location marker) or by no assignment at all.

## 3. Position → scope

`POSITION_SCOPE_LEVEL` in `src/lib/campaign-scope.ts`:

| Position | Scope |
|---|---|
| `state_coordinator` | `state` |
| `zone_coordinator` | `senatorial_zone` |
| `lga_coordinator` | `lga` |
| `ward_coordinator` | `ward` |
| `pu_coordinator` | `polling_unit` |
| `campaign_member` | none — self scope = registered PU |
| `campaign_manager`, `council_chairman` | `state` |

Authority is always **the scope and everything below it**, decided by
`isScopeDescendant()` — never by a page-local comparison.

## 4. Effective authority

`resolveCampaignAuthority(profile, assignments)` returns:

```ts
{
  isAdmin: boolean;
  assignment: OrganizationalAssignment | null;
  position: OrganizationalPosition | null;
  level: ScopeType | null;
  scopeId: string | null;
  isCoordinator: boolean;
}
```

- Coordinator → their assignment's level and id.
- Plain member → `polling_unit` + `profile.polling_unit_id`, falling back to
  `ward` + `profile.ward_id`, and finally `null` when nothing is registered.
- Admin → universal authority; `isAdmin` short-circuits every page.

`useCampaignAuthority()` wraps this together with the resolved
`CampaignScope` (the expanded ward/PU id sets) and `canCreateAt()`, and is the
only thing campaign pages consume.

## 5. Expansion

`resolveCampaignScope(level, scopeId, lgas?)` turns a scope into concrete ids:

```ts
{
  level, scope_id, label,
  lgaIds: string[],
  wardIds: string[],
  pollingUnitIds: string[],
}
```

- state / campaign → every LGA, ward and PU
- `senatorial_zone` → the zone's LGAs (from the constituency reference) and
  their wards
- `lga` → the LGA and its wards
- `ward` → the ward and its PUs
- `polling_unit` → that PU

Returns `null` when a scope cannot be resolved, which callers must treat as
"nothing to show" — never as "show everything".

The resolver is async because the hierarchy comes from
`electoral_data/enugu-state` (with the bundled dataset as offline fallback).

## 6. Coverage checks

```ts
scopeCovers(source, target, lgas?)       // is target at or inside source
canCreateAtScope(profile, assignments, target, lgas?)
```

`canCreateAtScope` is the creation gate for assignments and activities:

- admin → always true
- coordinator → true only when `assignmentCoversScope()` accepts the target
  (own scope or below, never above, never sideways)
- plain member → false

## 7. Permissions

`src/lib/permissions.ts` remains the authority. Round 5 changed three things:

1. **`campaign_member` no longer grants `create_activity` or `assign_task`.**
   Plain members participate; they do not create campaign work.
2. **`pu_coordinator` has a permission case** mirroring the ward coordinator:
   `view_members`, `view_member_contacts`, `view_assignments`,
   `create_assignment`, `assign_task`, `review_assignment`, `view_activities`,
   `create_activity`, `manage_activity`, `submit_field_report`,
   `review_field_report`, `report_issue`, `manage_issue`, `view_notices`,
   `view_documents`, `view_analytics`.
3. **The `senatorial_zone` branch of `isScopeDescendant()` is now precise.**
   It used to return `true` for every target once the source was a zone, which
   made a zone coordinator cover the entire state. It now resolves the zone's
   LGAs through the constituency reference (and still allows an unresolvable
   zone to fall back rather than hiding everything).

## 8. The scope picker

`src/components/campaign/ScopePicker.tsx` is the **only** place scope ids are
assembled into options. One component, six call sites:

1. Admin Coordination — assign a position
2. Admin member add / edit — home ward and polling unit
3. Assignment creation — target scope
4. Activity creation — admin scope
5. Reports page — admin scope filter
6. Activities page — admin scope filter

Behaviour:

- Level select → cascade (Ward needs an LGA, PU needs LGA + ward)
- Search above the cascade filters by name **and** code
- State is a fixed single option; Zone is the fixed three
- Duplicate ward names are prefixed with their LGA name
- The resolved id is rendered as small grey text under the picker

## 9. Firestore rules and the `user_access` index

The rules resolve permissions from `user_access` documents with derived ids:

```
{uid}__{permission}__global
{uid}__{permission}__{scope_type}__{scope_id}
```

Before Round 5 nothing wrote campaign permissions into that index, so every
non-admin campaign write was denied. `src/lib/firebase/userAccess.ts` now
projects the campaign permission set on every assignment write, expanded to:

| Assignment scope | Index documents |
|---|---|
| `state` / `campaign` | one `global` document per permission |
| `senatorial_zone` | each LGA in the zone + each of their wards |
| `lga` | the LGA + its wards |
| `ward` | the ward |
| `polling_unit` | the polling unit |

Polling units are not enumerated: campaign documents that can be PU-scoped
carry the ward they belong to (`scope_ward_id` / `target_ward_id`) and the
rules fall back to the ward-level grant. This keeps a zone assignment at a few
hundred index rows instead of several thousand.

See `docs/CHANGELOG-round5.md` for the exact rule diffs.
