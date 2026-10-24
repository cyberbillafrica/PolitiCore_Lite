/*
 * ============================================================
 * CAMPAIGN DATE-ONLY FIELDS
 * ============================================================
 *
 * An assignment's due date and an activity's scheduled date are
 * DATE-ONLY values: the forms use `<input type="date">`, which speaks
 * "YYYY-MM-DD". Firestore stores them as a timestamp at LOCAL MIDNIGHT
 * so that `firestore.rules` can compare the value with `request.time`
 * (the rules language cannot parse a date string — see
 * `isCurrentOrFutureDate()` in firestore.rules).
 *
 * Local midnight is deliberate: it is at least 24h old by the time the
 * NEXT day starts, so "yesterday" fails the rule's one-day grace and
 * "today" passes it in every timezone.
 *
 * Reading is tolerant: documents written before Round 8 carry the same
 * value as a plain "YYYY-MM-DD" string, and are still mapped to the
 * exact same shape the UI has always rendered.
 */

import { Timestamp } from "firebase/firestore";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Today in the USER'S timezone, as the value `<input type="date">`
 * expects. Used for the `min` attribute, so the local clock decides —
 * never UTC.
 */
export function todayLocalDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A "YYYY-MM-DD" form value as the stored representation: a timestamp
 * at local midnight. Returns null for an empty or impossible date.
 */
export function dateOnlyToTimestamp(
  value?: string | null,
): Timestamp | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day, 0, 0, 0, 0);

  /* Reject a rolled-over value such as 2026-02-31. */
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return Timestamp.fromDate(date);
}

/**
 * A stored date field (timestamp, or a legacy "YYYY-MM-DD" string) as
 * "YYYY-MM-DD". Returns null when the field is absent or unusable.
 */
export function dateOnlyFromValue(value: unknown): string | null {
  if (typeof value === "string") return value || null;

  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();

    if (Number.isNaN(date.getTime())) return null;

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate(),
    )}`;
  }

  return null;
}

/** True when a "YYYY-MM-DD" value is today or later on the local clock. */
export function isTodayOrFuture(value?: string | null): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return true;

  return trimmed >= todayLocalDate();
}
