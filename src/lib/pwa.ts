/*
 * ============================================================
 * PWA POLICY — PURE FUNCTIONS
 * ============================================================
 *
 * Install-prompt gating and service-worker request classification
 * live here, not inside the components, so the decisions can be
 * tested without a browser. The components in
 * src/components/pwa/ only translate these results into UI.
 *
 * The prompts are deliberately conservative:
 *   - never on an already-installed app (standalone display)
 *   - "Not now" snoozes for 30 days, not forever
 *   - "Install" permanently retires the banner for this browser
 *   - iOS gets instructions rather than a prompt (no
 *     beforeinstallprompt on Safari)
 */

/** Set once the user has acted on the native install prompt. */
export const PWA_INSTALL_DISMISSED_KEY = "pwa-install-dismissed";

/** Epoch-ms timestamp; the banner stays hidden until this passes. */
export const PWA_INSTALL_SNOOZE_KEY = "pwa-install-snoozed-until";

/** Epoch-ms timestamp for the iOS “Add to Home Screen” hint. */
export const PWA_IOS_HINT_DISMISSED_KEY = "pwa-ios-hint-dismissed";

/** 30 days, shared by the Android snooze and the iOS hint dismissal. */
export const PWA_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export type InstallPromptState = {
  standalone: boolean;
  permanentlyDismissed: boolean;
  snoozedUntil: number | null;
  now: number;
};

export type IosHintState = {
  isIosSafari: boolean;
  standalone: boolean;
  dismissedUntil: number | null;
  now: number;
};

/**
 * Whether the Android/Chromium banner may be shown, given the app is
 * installed, the user has retired it, or is inside a snooze window.
 */
export function shouldShowInstallPrompt(state: InstallPromptState): boolean {
  if (state.standalone) return false;
  if (state.permanentlyDismissed) return false;
  if (state.snoozedUntil !== null && state.snoozedUntil > state.now) {
    return false;
  }
  return true;
}

/** Whether the iOS Safari hint may be shown. */
export function shouldShowIosHint(state: IosHintState): boolean {
  if (!state.isIosSafari) return false;
  if (state.standalone) return false;
  if (state.dismissedUntil !== null && state.dismissedUntil > state.now) {
    return false;
  }
  return true;
}

/**
 * `display-mode: standalone` covers Android/iOS home-screen installs;
 * the other two modes also mean the browser chrome is gone.
 */
export function isStandaloneMode(displayMode: string | null | undefined): boolean {
  return (
    displayMode === "standalone" ||
    displayMode === "fullscreen" ||
    displayMode === "minimal-ui"
  );
}

/**
 * True for Safari on iPhone/iPad/iPod. iPadOS reports a Macintosh
 * user agent, so touch points are the discriminator there.
 *
 * Chrome/Firefox/Edge on iOS all carry “Safari” in their user agent,
 * hence the browser-token exclusions — none of them can install from
 * the share sheet the way Safari can.
 */
export function isIosSafari(
  userAgent: string | null | undefined,
  maxTouchPoints = 0,
): boolean {
  const ua = userAgent ?? "";

  const isIosDevice =
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && maxTouchPoints > 1);

  const isOtherIosBrowser = /crios|fxios|edgios|opios/i.test(ua);
  const isSafari = /safari/i.test(ua) && !isOtherIosBrowser;

  return isIosDevice && isSafari;
}

/** Epoch-ms instant a fresh 30-day cooldown ends. */
export function promptCooldownUntil(now: number): number {
  return now + PWA_PROMPT_COOLDOWN_MS;
}

/** Parse a stored timestamp; anything unusable becomes null. */
export function readSnoozeUntil(raw: string | null | undefined): number | null {
  if (!raw) return null;

  const parsed = Number(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Firebase endpoints that must never enter a cache: Firestore's
 * WebChannel, Auth, Installations and Storage. The service worker
 * registers these as NetworkOnly before any other route so the app
 * shell cache can never replay or answer a database/auth request.
 */
const FIREBASE_API_HOSTS = new Set([
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebaseinstallations.googleapis.com",
  "firebasestorage.googleapis.com",
  "www.googleapis.com",
]);

export function isFirebaseHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  return (
    FIREBASE_API_HOSTS.has(host) ||
    host.endsWith(".firebaseapp.com") ||
    host === "firebaseapp.com" ||
    host.endsWith(".firebaseio.com") ||
    host.endsWith(".cloudfunctions.net")
  );
}

/**
 * Signed-in surfaces. Their HTML is never read from the cache, so a
 * stale portal shell can't greet a signed-out visitor after logout.
 */
export function isAuthenticatedPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/")
  );
}
