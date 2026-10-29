import { describe, expect, it } from "vitest";

import {
  PWA_PROMPT_COOLDOWN_MS,
  isAuthenticatedPath,
  isFirebaseHost,
  isIosSafari,
  isStandaloneMode,
  promptCooldownUntil,
  readSnoozeUntil,
  shouldShowInstallPrompt,
  shouldShowIosHint,
} from "@/lib/pwa";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("install prompt gating", () => {
  const base = {
    standalone: false,
    permanentlyDismissed: false,
    snoozedUntil: null,
    now: NOW,
  };

  it("shows to a fresh, non-installed visitor", () => {
    expect(shouldShowInstallPrompt(base)).toBe(true);
  });

  it("never shows once the app is installed (standalone)", () => {
    expect(shouldShowInstallPrompt({ ...base, standalone: true })).toBe(false);
  });

  it("never shows after permanent dismissal", () => {
    expect(
      shouldShowInstallPrompt({ ...base, permanentlyDismissed: true }),
    ).toBe(false);
  });

  it("respects an active 30-day snooze", () => {
    expect(
      shouldShowInstallPrompt({ ...base, snoozedUntil: NOW + DAY }),
    ).toBe(false);
  });

  it("shows again once the snooze has elapsed", () => {
    expect(
      shouldShowInstallPrompt({ ...base, snoozedUntil: NOW - DAY }),
    ).toBe(true);
    expect(shouldShowInstallPrompt({ ...base, snoozedUntil: NOW })).toBe(true);
  });

  it("snoozes for exactly 30 days", () => {
    expect(promptCooldownUntil(NOW)).toBe(NOW + PWA_PROMPT_COOLDOWN_MS);
    expect(PWA_PROMPT_COOLDOWN_MS).toBe(30 * DAY);
  });
});

describe("standalone detection", () => {
  it("treats every chrome-less display mode as installed", () => {
    expect(isStandaloneMode("standalone")).toBe(true);
    expect(isStandaloneMode("fullscreen")).toBe(true);
    expect(isStandaloneMode("minimal-ui")).toBe(true);
  });

  it("does not treat a browser tab as installed", () => {
    expect(isStandaloneMode("browser")).toBe(false);
    expect(isStandaloneMode("")).toBe(false);
    expect(isStandaloneMode(null)).toBe(false);
  });
});

describe("iOS Safari detection", () => {
  const IPHONE_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const IPAD_SAFARI =
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const IPADOS_DESKTOP_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  const MAC_SAFARI = IPADOS_DESKTOP_UA;
  const IOS_CHROME =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1";
  const IOS_FIREFOX =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15";
  const ANDROID_CHROME =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

  it("recognises iPhone and iPad Safari", () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true);
    expect(isIosSafari(IPAD_SAFARI)).toBe(true);
  });

  it("recognises iPadOS reporting a Macintosh user agent via touch points", () => {
    expect(isIosSafari(IPADOS_DESKTOP_UA, 5)).toBe(true);
    expect(isIosSafari(MAC_SAFARI, 0)).toBe(false);
  });

  it("excludes other iOS browsers, whose share sheets cannot install", () => {
    expect(isIosSafari(IOS_CHROME)).toBe(false);
    expect(isIosSafari(IOS_FIREFOX)).toBe(false);
  });

  it("excludes Android Chrome and empty agents", () => {
    expect(isIosSafari(ANDROID_CHROME)).toBe(false);
    expect(isIosSafari("")).toBe(false);
    expect(isIosSafari(undefined)).toBe(false);
  });
});

describe("iOS hint gating", () => {
  const base = {
    isIosSafari: true,
    standalone: false,
    dismissedUntil: null,
    now: NOW,
  };

  it("shows on iOS Safari before install", () => {
    expect(shouldShowIosHint(base)).toBe(true);
  });

  it("hides on every non-iOS browser", () => {
    expect(shouldShowIosHint({ ...base, isIosSafari: false })).toBe(false);
  });

  it("hides when already installed", () => {
    expect(shouldShowIosHint({ ...base, standalone: true })).toBe(false);
  });

  it("respects the 30-day dismissal window", () => {
    expect(
      shouldShowIosHint({ ...base, dismissedUntil: NOW + DAY }),
    ).toBe(false);
    expect(
      shouldShowIosHint({ ...base, dismissedUntil: NOW - DAY }),
    ).toBe(true);
  });
});

describe("stored snooze parsing", () => {
  it("accepts positive epochs only", () => {
    expect(readSnoozeUntil("1800000000000")).toBe(1_800_000_000_000);
    expect(readSnoozeUntil("0")).toBeNull();
    expect(readSnoozeUntil("-5")).toBeNull();
    expect(readSnoozeUntil("not-a-number")).toBeNull();
    expect(readSnoozeUntil("")).toBeNull();
    expect(readSnoozeUntil(null)).toBeNull();
  });
});

describe("service-worker request classification", () => {
  it("refuses to cache Firebase API hosts", () => {
    expect(isFirebaseHost("firestore.googleapis.com")).toBe(true);
    expect(isFirebaseHost("identitytoolkit.googleapis.com")).toBe(true);
    expect(isFirebaseHost("securetoken.googleapis.com")).toBe(true);
    expect(isFirebaseHost("firebasestorage.googleapis.com")).toBe(true);
    expect(isFirebaseHost("demo-app.firebaseapp.com")).toBe(true);
    expect(isFirebaseHost("us-central1-demo.cloudfunctions.net")).toBe(true);
  });

  it("does not treat ordinary or font hosts as Firebase", () => {
    expect(isFirebaseHost("politicore.org")).toBe(false);
    expect(isFirebaseHost("fonts.googleapis.com")).toBe(false);
    expect(isFirebaseHost("res.cloudinary.com")).toBe(false);
    expect(isFirebaseHost("notfirebaseapp.com")).toBe(false);
  });

  it("treats portal and login documents as authenticated", () => {
    expect(isAuthenticatedPath("/portal")).toBe(true);
    expect(isAuthenticatedPath("/portal/dashboard")).toBe(true);
    expect(isAuthenticatedPath("/portal/election/upload")).toBe(true);
    expect(isAuthenticatedPath("/login")).toBe(true);
  });

  it("leaves public routes cacheable", () => {
    expect(isAuthenticatedPath("/")).toBe(false);
    expect(isAuthenticatedPath("/news")).toBe(false);
    expect(isAuthenticatedPath("/portalx")).toBe(false);
    expect(isAuthenticatedPath("/manifesto")).toBe(false);
    expect(isAuthenticatedPath("/~offline")).toBe(false);
  });
});
