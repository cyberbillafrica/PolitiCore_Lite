# Member Suspension

How suspension works: the data model, the reactive auto-signout, the
login-attempt block, the rules gates, and how an admin suspends or
un-suspends a member.

## Data model

`status` lives on the member's `/users/{uid}` document
(`UserProfile` in `src/types/index.ts`):

| Field | Type | Meaning |
| --- | --- | --- |
| `status` | `string` (optional) | `"suspended"` blocks the member. `"active"` — or an **absent** field — means active. |
| `suspended_at` | timestamp / `null` | When the current suspension started (audit). |
| `suspended_by` | string / `null` | Admin uid that applied it (audit). |

The document is **never deleted** on suspension, so the member's prior
submissions (`pu_reports`, `election_incidents`, `election_results`)
remain intact and unchanged.

## Writing status

`setMemberSuspended(memberId, suspended, adminUserId)` in
`src/lib/firebase/campaignMembers.ts` writes `status`, `suspended_at`
and `suspended_by`. It is an admin update on `/users/{uid}`, which the
existing rule `allow update: if isAdmin()` already permits — no rules
change was needed for the write path.

## Admin UI

`src/app/portal/admin/members/page.tsx`:

- each member row has a **Suspend / Un-suspend** action (Ban / UserCheck
  icon) between Edit and Delete;
- both actions open a confirmation dialog explaining the effect
  (suspension warns that the member is signed out immediately and that
  their submissions stay intact);
- suspended members carry a red **Suspended** badge next to their name.

## Auto-signout (reactive)

`src/contexts/AuthContext.tsx` enforces suspension in two places, both
using helpers from `src/lib/firebase/auth.ts`:

1. **At sign-in** — after `getUserProfile`, if `status === "suspended"`
   the context publishes no profile and calls `logOut()` immediately.
2. **Mid-session** — `subscribeToUserStatus(uid, …)` keeps a live
   `onSnapshot` on the caller's own `/users/{uid}` document. The moment
   it flips to `status: "suspended"`, the context clears the profile,
   assignments and grants and signs the member out — no route change or
   reload is waited for.

Both paths call `flagSuspensionNotice()`, which stores a one-time
session flag (`SUSPENSION_NOTICE_STORAGE_KEY`).

## Login attempt

The Firebase Auth sign-in technically succeeds; the app detects the
suspension and kicks the member out (checks above). The login page
(`src/app/login/page.tsx`) consumes the one-time flag via
`consumeSuspensionNotice()` and shows:

> Your account has been suspended. Please contact an administrator.

The notice appears exactly once per ejection.

## Rules gates (second layer)

`firestore.rules` gains an `isActiveUser()` helper and the sensitive
election collections are gated on it. **Exact diff:**

```diff
+    // ============================================================
+    // ACCOUNT STATUS (suspension)
+    // ============================================================
+    function isActiveUser() {
+      return isSignedIn()
+        && userExists()
+        && (
+          !callerProfile().keys().hasAny(["status"])
+          || callerProfile().status != "suspended"
+        );
+    }
```

```diff
     match /election_results/{resultId} {
-      allow read: if canReadElectionResult(resource.data);
-      allow create: if electionModeEnabled()
+      allow read: if isActiveUser()
+        && canReadElectionResult(resource.data);
+      allow create: if isActiveUser()
+        && electionModeEnabled()
```

```diff
     match /pu_reports/{reportId} {
-      allow read: if isAdmin();
-      allow read: if isSignedIn()
+      allow read: if isActiveUser() && isAdmin();
+      allow read: if isActiveUser()
         && ( ... );
-      allow create: if isSignedIn()
+      allow create: if isActiveUser()
         && ( ... );
```

```diff
     match /election_incidents/{incidentId} {
-      allow read: if isAdmin();
-      allow read: if isSignedIn()
+      allow read: if isActiveUser() && isAdmin();
+      allow read: if isActiveUser()
         && ( ... );
-      allow create: if isSignedIn()
+      allow create: if isActiveUser()
         && ( ... );
```

Deliberately **not** gated (per spec):

- `/users/{uid}` own read — the client must read its own profile to
  detect the suspension and sign out;
- `/site_settings`, `/config` — needed for app boot;
- `/political_parties` — public read by design.

**Review note:** the spec asked for read gates at minimum; the diff
also gates *creates* on the three collections so a suspended member
cannot submit new reports/incidents/results from a modified client.
Update/delete rules on those collections were left untouched
(admin-only paths).

## How to suspend / un-suspend

1. Sign in as an administrator and open Admin → Members.
2. Find the member (search or filters).
3. Click the Suspend (red) button → confirm. The badge appears; if the
   member is online they are signed out within seconds.
4. To restore: click the Un-suspend (green) button → confirm. The member
   can sign in normally again.

## Verification checklist

- Suspend a signed-in test member → they are ejected immediately and
  see the notice on `/login`.
- Attempt login while suspended → sign-in is detected, the member is
  signed out, the message shows on `/login`.
- Un-suspend → login works normally.
- The suspended member's earlier `pu_reports` / `election_results` are
  unchanged.
