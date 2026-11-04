/*
 * ============================================================
 * SELF-SERVICE PASSWORD RESET (Round 18)
 * ============================================================
 *
 * Three Firebase Auth calls make up a reset:
 *
 *   sendPasswordResetEmail   request a link
 *   verifyPasswordResetCode  check the oobCode before showing a form
 *   confirmPasswordReset     spend the code and set the password
 *
 * The pages never call the SDK directly. Every function here returns a
 * typed result instead of throwing, for two reasons:
 *
 *   1. A rejected promise that nobody awaits leaves the submit button
 *      spinning forever. Round 17A shipped exactly that failure.
 *   2. The pages need to distinguish "wrong email" from "too many
 *      attempts" from "link expired", and Firebase's error codes are
 *      the only place that difference exists.
 *
 * These are the real SDK calls, not wrappers around a mock: the
 * integration tests in tests/integration/password-reset.test.ts run
 * them against the Auth emulator.
 */

import {
  confirmPasswordReset,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
} from "firebase/auth";

import { auth } from "./config";

/** The product's minimum, deliberately stricter than Firebase's six. */
export const MIN_PASSWORD_LENGTH = 8;

/*
 * A reset request can stall on a dying connection. Waiting forever is
 * worse than a truthful "we could not reach the service", so each call
 * is bounded.
 */
const RESET_TIMEOUT_MS = 25_000;

export type ResetEmailFailure =
  | "invalid-email"
  | "rate-limited"
  | "network"
  | "unknown";

export type ResetCodeFailure = "expired" | "invalid" | "network" | "unknown";

export type ResetConfirmFailure =
  | "expired"
  | "invalid"
  | "weak-password"
  | "network"
  | "unknown";

export type SendResetEmailResult =
  | { ok: true }
  | { ok: false; failure: ResetEmailFailure };

export type VerifyResetCodeResult =
  | { ok: true; email: string }
  | { ok: false; failure: ResetCodeFailure };

export type ConfirmResetResult =
  | { ok: true }
  | { ok: false; failure: ResetConfirmFailure };

export const RESET_EMAIL_MESSAGES: Record<ResetEmailFailure, string> = {
  "invalid-email": "Enter a valid email address.",
  "rate-limited":
    "Too many reset attempts. Please wait 15 minutes before trying again.",
  network:
    "We could not reach the password reset service. Check your internet connection and try again.",
  unknown: "Could not send reset email. Please try again.",
};

export const RESET_CODE_MESSAGES: Record<ResetCodeFailure, string> = {
  expired: "This reset link has expired or is invalid.",
  invalid: "This reset link has expired or is invalid.",
  network:
    "We could not check your reset link. Check your internet connection and try again.",
  unknown: "We could not check your reset link. Please try again.",
};

export const RESET_CONFIRM_MESSAGES: Record<ResetConfirmFailure, string> = {
  expired: "This link has expired. Request a new one.",
  invalid: "This link has expired. Request a new one.",
  "weak-password": `That password is too weak. Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  network:
    "We could not reach the password reset service. Check your internet connection and try again.",
  unknown: "Could not reset password. Please try again.",
};

/** Firebase error codes look like `auth/user-not-found`. */
function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;

    if (typeof code === "string") return code.replace(/^auth\//, "");
  }

  return "";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side check; the server validates again. */
export function isEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/**
 * Password rules for the reset form.
 *
 * Returns the message to show, or null when the pair is acceptable, so
 * the caller can render it inline without duplicating the wording.
 */
export function validateNewPassword(
  password: string,
  confirmation: string,
): string | null {
  if (!password) return "Enter a new password.";

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password !== confirmation) return "Both passwords must match.";

  return null;
}

/**
 * Resolve with `fallback` if `work` has not settled in time.
 *
 * Both settlement paths are handled, so a late rejection can never
 * surface as an unhandled rejection after the caller has moved on.
 */
function withDeadline<T>(work: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), RESET_TIMEOUT_MS);

    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * Ask Firebase to email a reset link.
 *
 * `user-not-found` resolves as success on purpose: the page must never
 * confirm whether an address has an account. Some projects also enable
 * email enumeration protection, in which case Firebase resolves without
 * throwing at all — both paths return the same thing here.
 */
export async function requestPasswordReset(
  email: string,
): Promise<SendResetEmailResult> {
  const address = email.trim();

  if (!isEmailAddress(address)) {
    return { ok: false, failure: "invalid-email" };
  }

  const attempt = (async (): Promise<SendResetEmailResult> => {
    try {
      await sendPasswordResetEmail(auth, address);

      return { ok: true };
    } catch (error) {
      switch (errorCode(error)) {
        /* Never reveal whether the address is registered. */
        case "user-not-found":
          return { ok: true };

        case "invalid-email":
          return { ok: false, failure: "invalid-email" };

        case "too-many-requests":
          return { ok: false, failure: "rate-limited" };

        case "network-request-failed":
          return { ok: false, failure: "network" };

        default:
          console.error("Failed to send password reset email:", error);

          return { ok: false, failure: "unknown" };
      }
    }
  })();

  return withDeadline(attempt, { ok: false, failure: "network" });
}

/** Check the code from the email before showing a password form. */
export async function verifyResetCode(
  code: string,
): Promise<VerifyResetCodeResult> {
  const attempt = (async (): Promise<VerifyResetCodeResult> => {
    try {
      const email = await verifyPasswordResetCode(auth, code);

      return { ok: true, email };
    } catch (error) {
      switch (errorCode(error)) {
        case "expired-action-code":
          return { ok: false, failure: "expired" };

        case "invalid-action-code":
        case "user-not-found":
          return { ok: false, failure: "invalid" };

        case "network-request-failed":
          return { ok: false, failure: "network" };

        default:
          console.error("Failed to verify password reset code:", error);

          return { ok: false, failure: "unknown" };
      }
    }
  })();

  return withDeadline(attempt, { ok: false, failure: "network" });
}

/**
 * Spend the code and set the new password.
 *
 * The code is single-use: a second attempt with the same code fails,
 * which is why the form stops offering the button once it succeeds.
 */
export async function confirmNewPassword(
  code: string,
  password: string,
): Promise<ConfirmResetResult> {
  const attempt = (async (): Promise<ConfirmResetResult> => {
    try {
      await confirmPasswordReset(auth, code, password);

      return { ok: true };
    } catch (error) {
      switch (errorCode(error)) {
        case "expired-action-code":
          return { ok: false, failure: "expired" };

        case "invalid-action-code":
        case "user-not-found":
          return { ok: false, failure: "invalid" };

        case "weak-password":
          return { ok: false, failure: "weak-password" };

        case "network-request-failed":
          return { ok: false, failure: "network" };

        default:
          console.error("Failed to reset password:", error);

          return { ok: false, failure: "unknown" };
      }
    }
  })();

  return withDeadline(attempt, { ok: false, failure: "network" });
}
