/*
 * ============================================================
 * NOTIFICATION VOCABULARY — PURE, FIREBASE-FREE
 * ============================================================
 *
 * The nine workflow events that write a per-user notification, plus the
 * recipient cap every fan-out obeys.
 *
 * Kept free of Firebase imports so the browser, the rules tests and the
 * Firestore module all agree on the exact list the security rules
 * validate (`firestore.rules` — the notifications create clause).
 */

import type { NotificationType } from "@/types";

/** Every type the `notifications` create rule accepts. */
export const NOTIFICATION_TYPES: NotificationType[] = [
  "assignment_created",
  "assignment_completed",
  "assignment_approved",
  "assignment_rejected",
  "report_reviewed",
  "issue_raised",
  "issue_status_changed",
  "activity_created",
  "role_assigned",
  "registration_pending",
  "registration_approved",
  "registration_rejected",
];

/**
 * Most recipients ONE event may fan out to.
 *
 * A Firestore batch holds at most 500 writes; 100 keeps the write well
 * inside that limit and stops a state-wide activity or role change from
 * producing an unbounded burst. The rest of the audience is deliberately
 * dropped rather than split across several batches — a notification is
 * a courtesy, not a delivery guarantee.
 */
export const NOTIFICATION_RECIPIENT_CAP = 100;

/**
 * The recipients a fan-out may write to: unique, non-empty, never the
 * actor (nobody is notified about their own action), capped.
 */
/*
 * ============================================================
 * REGISTRATION REVIEW AUDIENCE (Round 17)
 * ============================================================
 */

/**
 * Most admins ONE signup may notify.
 *
 * A deployment with a large admin bench must not let a burst of public
 * signups turn into an unbounded fan-out; the first 20 admins are told, and
 * the review page is the source of truth for everyone else.
 */
export const REGISTRATION_ADMIN_CAP = 20;

/**
 * Admins who should hear about a new registration.
 *
 * Only ACTIVE admins count: an absent `status` is active (legacy
 * profiles), while a pending, rejected or suspended admin is skipped so a
 * not-yet-approved account can never be asked to approve somebody else.
 */
export function registrationAdminRecipients(
  admins: Array<{ id: string; status?: string | null }>,
  actorId: string,
  cap = REGISTRATION_ADMIN_CAP,
): string[] {
  const eligible = admins
    .filter((admin) => {
      const status = (admin.status ?? "").trim().toLowerCase();
      return status === "" || status === "active";
    })
    .map((admin) => admin.id);

  return capRecipients(eligible, actorId, cap);
}

export function capRecipients(
  userIds: Array<string | null | undefined>,
  actorId: string,
  cap = NOTIFICATION_RECIPIENT_CAP,
): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const value of userIds) {
    const userId = (value ?? "").trim();

    if (!userId || userId === actorId || seen.has(userId)) continue;

    seen.add(userId);
    recipients.push(userId);

    if (recipients.length >= cap) break;
  }

  return recipients;
}
