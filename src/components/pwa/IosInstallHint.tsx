"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

import { BRANDING } from "@/config/branding";
import {
  PWA_IOS_HINT_DISMISSED_KEY,
  isIosSafari,
  isStandaloneMode,
  promptCooldownUntil,
  readSnoozeUntil,
  shouldShowIosHint,
} from "@/lib/pwa";

/*
 * iOS Safari has no programmatic install prompt: the only route is
 * Share → Add to Home Screen. This banner explains that once, then
 * stays away for 30 days after dismissal.
 *
 * Chrome/Firefox on iOS are excluded by `isIosSafari` — their share
 * sheet has no Add to Home Screen entry, so the instruction would be
 * wrong.
 */
export default function IosInstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;

    let dismissedUntil: number | null = null;

    try {
      dismissedUntil = readSnoozeUntil(
        window.localStorage.getItem(PWA_IOS_HINT_DISMISSED_KEY),
      );
    } catch {
      // Storage can be unavailable (private mode, blocked storage).
    }

    setVisible(
      shouldShowIosHint({
        isIosSafari: isIosSafari(
          window.navigator.userAgent,
          window.navigator.maxTouchPoints ?? 0,
        ),
        standalone,
        dismissedUntil,
        now: Date.now(),
      }),
    );
  }, []);

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(
        PWA_IOS_HINT_DISMISSED_KEY,
        String(promptCooldownUntil(Date.now())),
      );
    } catch {
      // Storage failure only means the hint may return next session.
    }

    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 lg:bottom-6">
      <div
        role="region"
        aria-label="Install on your iPhone"
        className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-800 dark:bg-gray-900"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-sm font-black text-white">
          {BRANDING.monogram}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            Install on your iPhone
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
            Tap
            <Share className="inline h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
            <strong className="font-bold">Share</strong>
            then
            <strong className="font-bold">Add to Home Screen</strong>
            to install {BRANDING.shortName}.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install hint"
          className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
