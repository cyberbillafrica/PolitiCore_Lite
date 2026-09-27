"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldAlert } from "lucide-react";

/**
 * Guard for every /portal/election/* surface.
 *
 * Access matrix (mirrors firestore.rules):
 *
 *   admin            -> allowed
 *   election_officer -> allowed
 *   member (any)     -> NOT allowed; election access is never
 *                       granted through membership alone
 *   signed out       -> redirected to login by the portal layout
 *
 * The portal sidebar hides election links for ineligible users,
 * but a manually typed URL must land here instead of surfacing a
 * raw Firestore permission-denied error.
 */
export default function ElectionAccessGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, accessLoading } = useAuth();
  const router = useRouter();

  const accessRole = profile?.access_role ?? null;

  const hasElectionAccess =
    accessRole === "admin" || accessRole === "election_officer";

  useEffect(() => {
    if (accessLoading) return;

    if (profile && !hasElectionAccess) {
      router.replace("/portal/dashboard");
    }
  }, [accessLoading, profile, hasElectionAccess, router]);

  if (accessLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Checking election access…</span>
        </div>
      </div>
    );
  }

  if (!hasElectionAccess) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <ShieldAlert className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            Election access restricted
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Your account does not have election operations access. This area
            is limited to administrators and election officers.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
