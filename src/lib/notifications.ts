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
