"use client";

/*
 * ============================================================
 * TOAST (compatibility shim)
 *
 * The app standardizes on Sonner. This shim keeps the existing
 * `useToast()` API alive so call sites don't need a mass
 * rewrite — every call here is forwarded to the shared Sonner
 * policy in src/lib/notify.ts (bottom-right, variant colors,
 * 4s success/info / 6s warning / 8s error, max 3 stacked).
 *
 * New code should import `notify` from "@/lib/notify"
 * directly, or `import { toast } from "sonner"` for flows that
 * need Sonner-specific features (ids, promises, actions).
 * ============================================================
 */

import { notify } from "@/lib/notify";

export interface ToastOptions {
  /** Optional short heading. Shown bold above the description. */
  title?: string;
  /** The human-readable message. */
  description: string;
  /** Auto-dismiss override after this many milliseconds. */
  duration?: number;
}

export interface ToastApi {
  (options: ToastOptions & { variant?: "success" | "error" | "warning" | "info" }): void;
  success: (description: string, options?: Partial<ToastOptions>) => void;
  error: (description: string, options?: Partial<ToastOptions>) => void;
  warning: (description: string, options?: Partial<ToastOptions>) => void;
  info: (description: string, options?: Partial<ToastOptions>) => void;
}

function dispatch(
  variant: "success" | "error" | "warning" | "info",
  description: string,
  options?: Partial<ToastOptions>,
): void {
  const fn =
    variant === "success"
      ? notify.success
      : variant === "error"
        ? notify.error
        : variant === "warning"
          ? notify.warning
          : notify.info;

  fn(description, {
    title: options?.title,
    duration: options?.duration,
  });
}

export const toastApi: ToastApi = Object.assign(
  (
    options: ToastOptions & { variant?: "success" | "error" | "warning" | "info" },
  ) => {
    dispatch(options.variant ?? "info", options.description, options);
  },
  {
    success: (description: string, options?: Partial<ToastOptions>) =>
      dispatch("success", description, options),
    error: (description: string, options?: Partial<ToastOptions>) =>
      dispatch("error", description, options),
    warning: (description: string, options?: Partial<ToastOptions>) =>
      dispatch("warning", description, options),
    info: (description: string, options?: Partial<ToastOptions>) =>
      dispatch("info", description, options),
  },
);

/**
 * Returns the shared toast API. The Sonner <Toaster /> in the root
 * layout now renders notifications for the whole tree, so the hook
 * simply hands out the singleton.
 */
export function useToast(): ToastApi {
  return toastApi;
}

export default toastApi;
