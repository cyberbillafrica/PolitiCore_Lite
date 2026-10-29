/*
 * ============================================================
 * ELECTION COUNTDOWN TARGET
 * ============================================================
 *
 * The homepage countdown is driven by ONE admin-editable value,
 * `site_settings/general.electionDate` — a date-only string
 * ("YYYY-MM-DD"). Election day starts at midnight West Africa Time
 * (UTC+1, no DST), matching how election days are announced.
 *
 * When the setting is empty (a fresh clone before the admin sets a
 * date), the build-time seed from src/config/branding.ts is used so
 * the homepage always shows a sensible countdown. The label is
 * derived from whichever date wins, so the two can never disagree.
 *
 * This module is deliberately free of React and Firebase so the rules
 * suite can exercise it without an emulator.
 */

import { BRANDING } from "@/config/branding";

const NIGERIA_TIME_ZONE = "Africa/Lagos";
const NIGERIA_UTC_OFFSET = "+01:00";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export interface ElectionTarget {
  /** False when the date came from the build-time BRANDING seed. */
  fromSettings: boolean;
  /** "YYYY-MM-DD" when fromSettings; "" for the branding seed. */
  date: string;
  /** Instant the countdown counts down to. */
  targetISO: string;
  /** Epoch milliseconds of targetISO. */
  targetMs: number;
  /** Human label, e.g. "Saturday, 6 February 2027". */
  label: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Coerce an admin-entered value to the date-only form the date input
 * speaks. Accepts "YYYY-MM-DD" and an ISO datetime whose date part is
 * the same calendar day; rejects anything impossible (2027-02-31) or
 * unparseable. Returns null when no usable date is present.
 */
export function normalizeElectionDate(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = trimmed.slice(0, 10);
  if (trimmed.length > 10 && !/^[T ]/.test(trimmed.charAt(10))) return null;

  const match = DATE_ONLY.exec(candidate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Label for a date-only value. Formatted at noon WAT so the weekday
 * cannot slip for any reader, whatever their own timezone.
 */
export function formatElectionDateLabel(date: string): string {
  const normalized = normalizeElectionDate(date);
  if (!normalized) return "";

  const [year, month, day] = normalized.split("-").map(Number);
  const noonWAT = new Date(
    `${normalized}T12:00:00${NIGERIA_UTC_OFFSET}`,
  );

  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: NIGERIA_TIME_ZONE,
  }).format(noonWAT);

  const monthName = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: NIGERIA_TIME_ZONE,
  }).format(noonWAT);

  return `${weekday}, ${day} ${monthName} ${year}`;
}

/**
 * Turn a date-only setting into the concrete instant the countdown
 * targets: midnight WAT on that day.
 */
export function electionDateTarget(date: string): {
  targetISO: string;
  targetMs: number;
  label: string;
} {
  const normalized = normalizeElectionDate(date);
  if (!normalized) {
    return { targetISO: "", targetMs: 0, label: "" };
  }

  const targetISO = `${normalized}T00:00:00${NIGERIA_UTC_OFFSET}`;

  return {
    targetISO,
    targetMs: Date.parse(targetISO),
    label: formatElectionDateLabel(normalized),
  };
}

/**
 * Resolve the effective countdown target: the admin's date when set,
 * otherwise the branding seed. Never throws; an unparseable branding
 * ISO yields targetMs 0 rather than NaN.
 */
export function resolveElectionTarget(settingsDate?: unknown): ElectionTarget {
  const date = normalizeElectionDate(settingsDate);

  if (date) {
    return { fromSettings: true, date, ...electionDateTarget(date) };
  }

  const targetMs = Date.parse(BRANDING.electionDateISO);

  return {
    fromSettings: false,
    date: "",
    targetISO: BRANDING.electionDateISO,
    targetMs: Number.isFinite(targetMs) ? targetMs : 0,
    label: BRANDING.electionDateLabel,
  };
}

/** Remaining whole days/hours/minutes/seconds, clamped at zero. */
export function calculateCountdown(
  targetMs: number,
  nowMs: number = Date.now(),
): CountdownParts {
  if (!Number.isFinite(targetMs)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const difference = Math.max(targetMs - nowMs, 0);

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / (1000 * 60)) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
}

/** True once every part is zero: the election day has arrived/passed. */
export function isCountdownComplete(parts: CountdownParts): boolean {
  return (
    parts.days === 0 &&
    parts.hours === 0 &&
    parts.minutes === 0 &&
    parts.seconds === 0
  );
}
