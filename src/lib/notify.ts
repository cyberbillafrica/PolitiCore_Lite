"use client";

/*
 * ============================================================
 * NOTIFICATION HUB (Sonner)
 *
 * Single notification layer for the whole app. All feedback —
 * saves, submissions, load failures, real-time events — goes
 * through these helpers, which apply one consistent policy:
 *
 *   Position:   bottom-right (desktop), stacked top on mobile
 *   Variants:   success (green) / error (red) / warning (amber) / info (blue)
 *   Durations:  success & info 4s, warning 6s, error 8s
 *   Max stack:  3 (Sonner default, intentionally not overridden)
 *   Dismissal:  click (Sonner default close button enabled)
 * ============================================================
 */

import { toast as sonnerToast } from "sonner";

export type NotifyVariant = "success" | "error" | "warning" | "info";

export interface NotifyOptions {
  /** Optional short heading shown bold above the description. */
  title?: string;
  /** The human-readable message. */
  description: string;
  /** Per-call duration override (ms). */
  duration?: number;
}

/** Per-variant auto-dismiss policy (ms). */
const DURATION_MS: Record<NotifyVariant, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 8000,
};

function dispatch(
  variant: NotifyVariant,
  description: string,
  options?: Partial<NotifyOptions>,
): void {
  const method =
    variant === "success"
      ? sonnerToast.success
      : variant === "error"
        ? sonnerToast.error
        : variant === "warning"
          ? sonnerToast.warning
          : sonnerToast.info;

  const duration = options?.duration ?? DURATION_MS[variant];

  method(options?.title || "", {
    description,
    duration,
    dismissible: true,
  });
}

export const notify = {
  success: (description: string, options?: Partial<NotifyOptions>) =>
    dispatch("success", description, options),
  error: (description: string, options?: Partial<NotifyOptions>) =>
    dispatch("error", description, options),
  warning: (description: string, options?: Partial<NotifyOptions>) =>
    dispatch("warning", description, options),
  info: (description: string, options?: Partial<NotifyOptions>) =>
    dispatch("info", description, options),
};
