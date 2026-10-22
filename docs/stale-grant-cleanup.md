# Stale grant cleanup

## What a stale grant is

A document in `user_access` that no longer corresponds to the user's
current state. Observed in the live project:

```
User B (plain member, formerly ward coordinator, formerly admin): 22 docs
  12 PU-scoped grants at PU 01-004        <- current baseline-ish
  10 ward-scoped grants at ward 04        <- stale: previous ward
  several with manage_documents / send_notice / view_analytics
  several carrying a legacy tenant_id field
```

Four shapes of stale document:

1. **Wrong scope** — the grant is still valid *for someone*, but the user
   moved wards, changed polling unit, or was reassigned to a different
   LGA/zone.
2. **Position no longer held** — a demoted coordinator keeps the
   coordinator permissions of the rank they used to hold.
3. **Permission not in the matrix** — `manage_documents`, `send_notice`,
   `view_analytics`, `view_member_contacts` were projected by an older
   build. The rules never consult them for campaign reads.
4. **Legacy fields** — a `tenant_id` from the pre-Supabase era, or a
   document missing `allowed` / `user_id`.

## Why they accumulated

The projection was additive-only:

```
create assignment  -> write grants for the new scope
update assignment  -> revoke the OLD scope, write the new one
delete assignment  -> revoke
```

That is correct only if the old scope is known exactly. It broke in the
paths that never ran a projection at all:

- `access_role` changes wrote nothing, so a former admin's admin-era
  grants (and any manually added ones) stayed forever;
- `membership_types` changes wrote nothing, so removing
  `campaign_member` left every grant in place;
- home-area changes (`ward_id`, `polling_unit_id`, `lga_id`) wrote
  nothing, so a member who moved kept their old ward's reads;
- a position change where the assignment document was edited outside the
  client (or by an admin in the console) never produced a revoke.

The result was a union of every position a user had ever held.

## What prevents it now

The projection is **recomputed**, not appended. Every trigger listed in
`docs/campaign-member-baseline.md` calls
`syncCampaignAccessForUser()`:

```
expected = computeExpectedCampaignAccess(current state)
delete   = recorded - expected
write    = expected - recorded
```

Because `expected` is derived from current state only, a grant the user
is no longer entitled to is simply not in the set — and everything
recorded that is not in the set is deleted. One atomic batch when the
change fits in 500 operations; adds-first chunks above that.

The **election projection** (`view_election_results`) belongs to another
writer and is excluded from every delete in this module, including the
cleanup script.

## Running the one-off cleanup

```bash
npm run cleanup:grants -- --dry-run   # report only, writes nothing
npm run cleanup:grants                # apply
```

Requires `serviceAccountKey.json` at the project root. It reads the
hierarchy from `electoral_data/enugu-state` and refuses to run if that
document is missing — an empty hierarchy would resolve nothing and make
every coordinator grant look stale.

Output is one line per changed user plus a summary:

```
{uid}  {name}
  deleted: N  added: M  expected total: K

================ SUMMARY ================
users scanned ....... 132
users changed ....... 9
users already ok .... 123
documents written ... 47
documents deleted ... 61
```

The script is idempotent: a second run reports zero changes. It is also
safe to re-run after any release that changes the matrix.

## What it deletes

Exactly the documents that are not in the expected projection:

- **permissions no longer in the matrix** — `manage_documents`,
  `send_notice`, `view_analytics`, `view_member_contacts`, any
  permission the campaign matrix does not project;
- **wrong scope** — a grant at a ward, LGA, zone or PU the user no longer
  belongs to;
- **a position no longer held** — all coordinator documents after a
  demotion (the baseline stays);
- **every campaign document of an ineligible user** — campaign membership
  removed, election officer, or no home area.

It also **rewrites** (not just deletes) an expected document that carries
a legacy `tenant_id`, a wrong `user_id`, or a non-boolean `allowed`.
`set()` without `merge` replaces the document, which is what strips the
legacy field.

It never touches:

- `view_election_results` documents (election projection);
- `/users`, `/organizational_assignments`, or any other collection.

## What it cannot fix

- A document with a **random** id (not `uid__permission__scope_type__scope_id`).
  `where("user_id", "==", uid)` still finds it and it is deleted, because
  the plan diffs by document id.
- Documents whose `user_id` field is missing or wrong. Those are not
  returned by the per-user query and are invisible to this script; they
  also fail `hasScopedAccess()` (which checks `user_id == uid`), so they
  grant nothing.
- Drift introduced by hand after the run. The next write through the app,
  or the next run, repairs it.
