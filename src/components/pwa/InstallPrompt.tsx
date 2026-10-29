"use client";

import { useEffect, useState } from "react";

import { BRANDING } from "@/config/branding";
import {
  PWA_INSTALL_DISMISSED_KEY,
  PWA_INSTALL_SNOOZE_KEY,
  isStandaloneMode,
  promptCooldownUntil,
  readSnoozeUntil,
  shouldShowInstallPrompt,
} from "@/lib/pwa";

/*
 * Chromium/Android install banner.
 *
 * The browser only fires `beforeinstallprompt` when the app is
 * installable; calling preventDefault() lets us surface the offer at a
 * moment of our choosing instead of the browser's own mini-infobar.
 *
 * “Not now” snoozes for 30 days. Tapping “Install” retires the banner
 * for this browser, whether the native sheet is accepted or cancelled —
 * repeated nagging after an explicit action is worse than a missed
 * install.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;

    if (standalone) return;

    let permanentlyDismissed = false;
    let snoozedUntil: number | null = null;

    try {
      permanentlyDismissed =
        window.localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === "true";
      snoozedUntil = readSnoozeUntil(
        window.localStorage.getItem(PWA_INSTALL_SNOOZE_KEY),
      );
    } catch {
      // Storage can be unavailable (private mode, blocked storage).
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();

      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(
        shouldShowInstallPrompt({
          standalone: false,
          permanentlyDismissed,
          snoozedUntil,
          now: Date.now(),
        }),
      );
    };

    const handleInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);

      try {
        window.localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, "true");
      } catch {
        // Nothing to recover — the banner is already hidden.
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    setVisible(false);

    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      // The browser refused the prompt; there is nothing to retry.
    }

    try {
      window.localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, "true");
    } catch {
      // Storage failure only means the banner may return next session.
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(
        PWA_INSTALL_SNOOZE_KEY,
        String(promptCooldownUntil(Date.now())),
      );
    } catch {
      // Storage failure only means the banner may return next session.
    }

    setVisible(false);
  };

  if (!visible || !deferredPrompt) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 lg:bottom-6">
      <div
        role="region"
        aria-label="Install this app"
        className="pointer-events-auto flex w-full max-w-md flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-sm font-black text-white">
          {BRANDING.monogram}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            Install {BRANDING.shortName} for quick access
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Add it to your home screen — it opens full screen, like an app.
          </p>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleInstall}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-600"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
