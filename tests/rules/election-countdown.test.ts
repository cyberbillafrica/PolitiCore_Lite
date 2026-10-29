import { describe, expect, it } from "vitest";

import { BRANDING } from "@/config/branding";
import {
  calculateCountdown,
  electionDateTarget,
  formatElectionDateLabel,
  isCountdownComplete,
  normalizeElectionDate,
  resolveElectionTarget,
} from "@/lib/election-countdown";

const ELECTION_DATE = "2027-02-06";
const TARGET_ISO = "2027-02-06T00:00:00+01:00";
const TARGET_MS = Date.parse(TARGET_ISO);

describe("normalizeElectionDate", () => {
  it("accepts a date-only value", () => {
    expect(normalizeElectionDate(ELECTION_DATE)).toBe(ELECTION_DATE);
  });

  it("trims whitespace", () => {
    expect(normalizeElectionDate("  2027-02-06  ")).toBe(ELECTION_DATE);
  });

  it("takes the calendar date from an ISO datetime", () => {
    expect(normalizeElectionDate("2027-02-06T00:00:00.000Z")).toBe(
      ELECTION_DATE,
    );
    expect(normalizeElectionDate("2027-02-06 08:30")).toBe(ELECTION_DATE);
  });

  it("rejects impossible calendar dates", () => {
    expect(normalizeElectionDate("2027-02-31")).toBeNull();
    expect(normalizeElectionDate("2027-13-01")).toBeNull();
    expect(normalizeElectionDate("2027-04-31")).toBeNull();
  });

  it("rejects malformed values", () => {
    expect(normalizeElectionDate("06/02/2027")).toBeNull();
    expect(normalizeElectionDate("2027-2-6")).toBeNull();
    expect(normalizeElectionDate("2027-02-06oops")).toBeNull();
    expect(normalizeElectionDate("")).toBeNull();
    expect(normalizeElectionDate("   ")).toBeNull();
    expect(normalizeElectionDate(undefined)).toBeNull();
    expect(normalizeElectionDate(null)).toBeNull();
    expect(normalizeElectionDate(20270206)).toBeNull();
  });
});

describe("formatElectionDateLabel", () => {
  it("derives the human label from the date", () => {
    expect(formatElectionDateLabel(ELECTION_DATE)).toBe(
      "Saturday, 6 February 2027",
    );
  });

  it("returns an empty label for an invalid date", () => {
    expect(formatElectionDateLabel("2027-02-31")).toBe("");
  });
});

describe("electionDateTarget", () => {
  it("targets midnight West Africa Time", () => {
    const target = electionDateTarget(ELECTION_DATE);

    expect(target.targetISO).toBe(TARGET_ISO);
    expect(target.targetMs).toBe(TARGET_MS);
    expect(target.label).toBe("Saturday, 6 February 2027");
  });

  it("returns a zero target for an invalid date", () => {
    expect(electionDateTarget("")).toEqual({
      targetISO: "",
      targetMs: 0,
      label: "",
    });
  });
});

describe("resolveElectionTarget", () => {
  it("prefers the admin-configured date", () => {
    const target = resolveElectionTarget(ELECTION_DATE);

    expect(target.fromSettings).toBe(true);
    expect(target.date).toBe(ELECTION_DATE);
    expect(target.targetISO).toBe(TARGET_ISO);
    expect(target.targetMs).toBe(TARGET_MS);
    expect(target.label).toBe("Saturday, 6 February 2027");
  });

  it("falls back to the branding seed when no date is set", () => {
    const target = resolveElectionTarget("");

    expect(target.fromSettings).toBe(false);
    expect(target.date).toBe("");
    expect(target.targetISO).toBe(BRANDING.electionDateISO);
    expect(target.targetMs).toBe(Date.parse(BRANDING.electionDateISO));
    expect(target.label).toBe(BRANDING.electionDateLabel);
  });

  it("falls back to the branding seed for an invalid stored value", () => {
    expect(resolveElectionTarget("not-a-date").fromSettings).toBe(false);
    expect(resolveElectionTarget(undefined).fromSettings).toBe(false);
  });
});

describe("calculateCountdown", () => {
  it("splits the remaining time into whole parts", () => {
    const now = TARGET_MS - (1 * 86_400 + 2 * 3_600 + 3 * 60 + 4) * 1_000;

    expect(calculateCountdown(TARGET_MS, now)).toEqual({
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
    });
  });

  it("floors partial seconds", () => {
    expect(calculateCountdown(TARGET_MS, TARGET_MS - 999).seconds).toBe(0);
    expect(calculateCountdown(TARGET_MS, TARGET_MS - 1_000).seconds).toBe(1);
  });

  it("clamps a past target to zeros", () => {
    expect(calculateCountdown(TARGET_MS, TARGET_MS + 60_000)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  it("treats an invalid target as zero", () => {
    expect(calculateCountdown(Number.NaN, Date.now())).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });
});

describe("isCountdownComplete", () => {
  it("is true only when every part is zero", () => {
    expect(isCountdownComplete({ days: 0, hours: 0, minutes: 0, seconds: 0 })).toBe(true);
    expect(isCountdownComplete({ days: 0, hours: 0, minutes: 0, seconds: 1 })).toBe(false);
    expect(isCountdownComplete({ days: 1, hours: 0, minutes: 0, seconds: 0 })).toBe(false);
  });
});
