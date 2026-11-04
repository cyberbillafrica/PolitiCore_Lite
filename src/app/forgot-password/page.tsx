"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Mail } from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import {
  requestPasswordReset,
  RESET_EMAIL_MESSAGES,
} from "@/lib/firebase/password-reset";

/*
 * ============================================================
 * FORGOT PASSWORD (Round 18)
 * ============================================================
 *
 * The result never says whether the address has an account: a real
 * send, an unknown address and (on some projects) an enumeration-safe
 * silent success all land on the same screen. That is deliberate — the
 * page must not become a way to test which emails have accounts.
 */

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const result = await requestPasswordReset(email);

      if (result.ok) {
        setSentTo(email.trim());
      } else {
        setError(RESET_EMAIL_MESSAGES[result.failure]);
      }
    } catch (error) {
      /*
       * requestPasswordReset() does not throw, but a failure here must
       * still stop the spinner rather than leave the form stuck.
       */
      console.error("Unexpected password reset failure:", error);
      setError(RESET_EMAIL_MESSAGES.unknown);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-apc-light flex flex-col">
      <Header />

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            {sentTo ? (
              /* Sent — the form is replaced so the button cannot be fired twice. */
              <div className="text-center">
                <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-apc-primary flex items-center justify-center">
                  <Mail className="w-7 h-7 text-white" />
                </div>

                <h1 className="text-3xl font-bold text-apc-primary">
                  Check your email
                </h1>

                <p className="mt-3 text-gray-600 leading-relaxed">
                  If an account exists for{" "}
                  <span className="font-semibold text-gray-900">{sentTo}</span>,
                  a reset link has been sent. Check your inbox and spam folder.
                </p>

                <p className="mt-4 text-sm text-gray-500">
                  The link expires after a short while. If it does not arrive,
                  you can request another one.
                </p>

                <Link
                  href="/login"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2
                             bg-apc-primary text-white py-3 rounded-lg font-semibold
                             hover:bg-apc-dark transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to login
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    setSentTo(null);
                    setError("");
                  }}
                  className="mt-3 text-sm font-medium text-apc-primary hover:underline"
                >
                  Use a different email address
                </button>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="text-center mb-8">
                  <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-apc-primary flex items-center justify-center">
                    <Lock className="w-7 h-7 text-white" />
                  </div>

                  <h1 className="text-3xl font-bold text-apc-primary">
                    Reset your password
                  </h1>

                  <p className="mt-2 text-gray-600">
                    Enter the email address you registered with
                  </p>
                </div>

                {/* Error */}
                {error && (
                  <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                    {error}
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Email Address
                    </label>

                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="w-full px-4 py-3 rounded-lg border border-gray-300
                                 focus:outline-none focus:ring-2
                                 focus:ring-apc-primary focus:border-transparent"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-apc-primary text-white py-3 rounded-lg
                               font-semibold hover:bg-apc-dark transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Sending reset link..." : "Send reset link"}
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

                <p className="mt-4 text-center text-sm text-gray-500">
                  Cannot access the email address on your account? Contact the
                  campaign team and they will help you regain access.
                </p>
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
