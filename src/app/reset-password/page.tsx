"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Lock, ShieldAlert } from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { logOut } from "@/lib/firebase/auth";
import {
  confirmNewPassword,
  MIN_PASSWORD_LENGTH,
  RESET_CODE_MESSAGES,
  RESET_CONFIRM_MESSAGES,
  validateNewPassword,
  verifyResetCode,
  type ResetCodeFailure,
} from "@/lib/firebase/password-reset";

/*
 * ============================================================
 * RESET PASSWORD (Round 18)
 * ============================================================
 *
 * The landing page for the link Firebase emails. The oobCode arrives as
 * a query parameter and is checked BEFORE the form is shown, so an
 * expired link explains itself instead of accepting a password and
 * failing afterwards.
 *
 * The code is single-use: once confirmPasswordReset succeeds, the same
 * link can never reset the password again.
 */

type Phase = "checking" | "missing" | "invalid" | "ready" | "done";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-apc-light flex flex-col">
      <Header />

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            {/*
             * useSearchParams() opts the subtree into client-side
             * rendering, so Next requires a Suspense boundary here for
             * the production build.
             */}
            <Suspense fallback={<CheckingLink />}>
              <ResetPasswordForm />
            </Suspense>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function CheckingLink() {
  return (
    <div className="text-center py-8">
      <Loader2 className="mx-auto w-8 h-8 text-apc-primary animate-spin" />

      <p className="mt-4 text-gray-600">Checking your reset link...</p>
    </div>
  );
}

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();

  const code = params.get("oobCode") ?? "";

  const [phase, setPhase] = useState<Phase>(code ? "checking" : "missing");
  const [accountEmail, setAccountEmail] = useState("");
  const [codeFailure, setCodeFailure] = useState<ResetCodeFailure>("invalid");
  const [attempt, setAttempt] = useState(0);

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(false);

  const redirect = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Verify the code on arrival. Nothing is written to the account until
   * the applicant submits the form.
   */
  useEffect(() => {
    if (!code) {
      setPhase("missing");
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await verifyResetCode(code);

      if (cancelled) return;

      if (result.ok) {
        setAccountEmail(result.email);
        setPhase("ready");
        return;
      }

      setCodeFailure(result.failure);
      setPhase("invalid");
    })();

    return () => {
      cancelled = true;
    };
  }, [code, attempt]);

  /* The success screen moves on by itself; cancel that if we unmount. */
  useEffect(() => {
    return () => {
      if (redirect.current) clearTimeout(redirect.current);
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) return;

    setSubmitError("");

    const problem = validateNewPassword(password, confirmation);

    if (problem) {
      setFieldError(problem);
      return;
    }

    setFieldError("");
    setLoading(true);

    try {
      const result = await confirmNewPassword(code, password);

      if (!result.ok) {
        if (result.failure === "expired" || result.failure === "invalid") {
          /* The link died between arriving and submitting. */
          setCodeFailure(result.failure);
          setPhase("invalid");
          return;
        }

        setSubmitError(RESET_CONFIRM_MESSAGES[result.failure]);
        return;
      }

      /*
       * Drop any existing session so the next sign-in uses the new
       * password rather than an old refresh token.
       */
      await logOut();

      setPhase("done");

      redirect.current = setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (error) {
      /* Confirmation never leaves the button spinning. */
      console.error("Unexpected password reset failure:", error);
      setSubmitError(RESET_CONFIRM_MESSAGES.unknown);
    } finally {
      setLoading(false);
    }
  };

  if (phase === "checking") {
    return <CheckingLink />;
  }

  if (phase === "missing") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
          <ShieldAlert className="w-7 h-7 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900">
          Invalid reset link
        </h1>

        <p className="mt-3 text-gray-600">
          This page needs a reset link from your email. Request a new one to
          continue.
        </p>

        <Link
          href="/forgot-password"
          className="mt-6 inline-flex w-full items-center justify-center
                     bg-apc-primary text-white py-3 rounded-lg font-semibold
                     hover:bg-apc-dark transition-colors"
        >
          Request a new link
        </Link>

        <Link
          href="/login"
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-apc-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>
      </div>
    );
  }

  if (phase === "invalid") {
    const canRetry =
      codeFailure === "network" || codeFailure === "unknown";

    return (
      <div className="text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
          <ShieldAlert className="w-7 h-7 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900">
          {canRetry ? "Could not verify this link" : "This link has expired"}
        </h1>

        <p className="mt-3 text-gray-600">
          {RESET_CODE_MESSAGES[codeFailure]}
        </p>

        {canRetry && (
          <button
            type="button"
            onClick={() => {
              setPhase("checking");
              setAttempt((value) => value + 1);
            }}
            className="mt-6 w-full bg-apc-primary text-white py-3 rounded-lg
                       font-semibold hover:bg-apc-dark transition-colors"
          >
            Try again
          </button>
        )}

        <Link
          href="/forgot-password"
          className={`${
            canRetry
              ? "mt-3 inline-flex w-full items-center justify-center border border-apc-primary text-apc-primary py-3 rounded-lg font-semibold hover:bg-apc-light transition-colors"
              : "mt-6 inline-flex w-full items-center justify-center bg-apc-primary text-white py-3 rounded-lg font-semibold hover:bg-apc-dark transition-colors"
          }`}
        >
          Request a new link
        </Link>

        <Link
          href="/login"
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-apc-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7 text-green-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900">
          Password reset successful
        </h1>

        <p className="mt-3 text-gray-600">
          You can now log in with your new password.
        </p>

        <p className="mt-4 text-sm text-gray-500">
          Taking you to the sign-in page...
        </p>

        <Link
          href="/login"
          className="mt-6 inline-flex w-full items-center justify-center
                     bg-apc-primary text-white py-3 rounded-lg font-semibold
                     hover:bg-apc-dark transition-colors"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-apc-primary flex items-center justify-center">
          <Lock className="w-7 h-7 text-white" />
        </div>

        <h1 className="text-3xl font-bold text-apc-primary">
          Set a new password
        </h1>

        <p className="mt-2 text-gray-600">
          Choose a strong password you have not used before
        </p>

        {accountEmail && (
          <p className="mt-3 text-sm text-gray-500">
            Resetting the password for{" "}
            <span className="font-semibold text-gray-900">{accountEmail}</span>
          </p>
        )}
      </div>

      {/* Error */}
      {submitError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {submitError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            New password
          </label>

          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldError("");
            }}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            autoComplete="new-password"
            className="w-full px-4 py-3 rounded-lg border border-gray-300
                       focus:outline-none focus:ring-2
                       focus:ring-apc-primary focus:border-transparent"
            required
            minLength={MIN_PASSWORD_LENGTH}
          />
        </div>

        <div>
          <label
            htmlFor="confirm-password"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Confirm new password
          </label>

          <input
            id="confirm-password"
            type="password"
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value);
              setFieldError("");
            }}
            placeholder="Re-enter your new password"
            autoComplete="new-password"
            className="w-full px-4 py-3 rounded-lg border border-gray-300
                       focus:outline-none focus:ring-2
                       focus:ring-apc-primary focus:border-transparent"
            required
            minLength={MIN_PASSWORD_LENGTH}
          />

          {fieldError && (
            <p className="mt-2 text-sm font-medium text-red-600">{fieldError}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-apc-primary text-white py-3 rounded-lg
                     font-semibold hover:bg-apc-dark transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Resetting password..." : "Set new password"}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm font-semibold text-apc-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>
      </div>
    </>
  );
}
