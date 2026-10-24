# NOTIFICATIONS AND ANNOUNCEMENTS

## Overview

The portal has one notification surface: the bell in the sticky header
(`src/components/notifications/NotificationBell.tsx`). It shows two
independent feeds in one panel, with one combined unread badge:

| Section | Source | Read state | Click |
| --- | --- | --- | --- |
| Notifications (top) | `notifications/{id}` — one row per user | `read` on the document | opens `link` |
| Announcements (bottom) | `portal_content/main.items[]` | `localStorage` (`dcm_read_notifications`) | marks read only |

Badge = unread notifications + unread announcements.

---

## 1. Notifications (per-user inbox)

### Data model

```
notifications/{autoId}
  user_id:     string   // recipient, the read boundary
  actor_id:    string   // who caused the event, must equal request.auth.uid
  type:        one of the nine events below
  title:       string   // 1..200 chars
  message:     string   // <= 500 chars
  link:        string   // portal path opened on click
  entity_type: string
  entity_id:   string
  read:        boolean  // false on create
  created_at:  timestamp (serverTimestamp)
  read_at:     timestamp | null
```

### The nine events

| Type | Written by | Recipients |
| --- | --- | --- |
| `assignment_created` | `createCampaignAssignment()` | resolved scope targets, or the individual assignee |
| `assignment_completed` | `submitCampaignReport()` | the assignment's creator |
| `assignment_approved` / `assignment_rejected` | `reviewCompletion()` | the member whose completion changed |
| `report_reviewed` | `reviewCampaignReport()` | the report's submitter |
| `issue_raised` | `raiseCampaignIssue()` | every admin |
| `issue_status_changed` | `acknowledgeCampaignIssue()` / `resolveCampaignIssue()` | the member who raised the issue |
| `activity_created` | `createCampaignActivity()` | members in the activity's scope |
| `role_assigned` | `createOrganizationalAssignment()` | the appointed member |

Each fan-out goes through `notifyUsers()` in
`src/lib/firebase/notifications.ts`, which de-duplicates recipients,
never notifies the actor, and caps the list at
`NOTIFICATION_RECIPIENT_CAP` (100) writes — one batch, inside the
Firestore 500-write limit. A failed fan-out is logged and swallowed:
a notification is a courtesy and must never roll back the workflow
that produced it.

### Rules (`firestore.rules` — `match /notifications/{id}`)

* read — owner (`user_id == request.auth.uid`) or admin
* create — any signed-in actor, but only with `actor_id` equal to the
  caller, a known event type, the field shape above, `read == false`
  and `created_at == request.time`
* update — owner only, and only the `read` / `read_at` keys, and only
  to `read == true`
* delete — admin

### Query

The bell subscribes to `user_id == uid` ordered by `created_at desc`,
limited to 100 rows. The composite index lives in
`firestore.indexes.json` (`notifications`: `user_id` ASC,
`created_at` DESC). **It is not deployed yet** — run
`firebase deploy --only firestore:indexes` before release.

---

## 2. Announcements (broadcast)

* Source of truth: the single document `portal_content/main`; its
  `items[]` holds both announcements and events.
* `getUserAnnouncements(profile)` applies the audience scope
  (`general`, `admins`, `campaign_members`, `social_members`,
  `election_officers`). The same filter is exported as
  `filterAnnouncementsForProfile()`.
* The bell now subscribes with `subscribeToAnnouncements()` (an
  `onSnapshot` on that document), so a new broadcast appears live. The
  one-shot read is kept for the first paint/fallback.
* Read state is device-local: announcements are one shared document and
  have nowhere to store per-user state. Moving it server-side would
  require a per-user subcollection.

---

## 3. Toasts

Sonner is mounted once in `src/app/layout.tsx` with `richColors`. Only
the base `toast` class is set (rounded corners, border, shadow); the
per-variant `success` / `error` / `warning` / `info` classes were removed
so Sonner's own rich colours are not overridden on the white portal
background. Durations and copy per call live in `src/lib/notify.ts`.
