"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Loader2 } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";

/*
 * ============================================================
 * CAMPAIGN ACCESS GATE
 * ============================================================
 *
 * Every `/portal/campaign/*` page is campaign work. Direct navigation
 * used to bypass the navigation menu, so an election officer or a
 * social-only member could open a campaign URL (and then read whatever
 * the page's own queries returned). The rule is now enforced for the
 * whole segment:
 *
 *   access_role === "admin"                      -> allow
 *   access_role === "election_officer"           -> deny
 *     (redirect to the election dashboard, even when the account also
 *      carries `campaign_member`: election operations are a separate
 *      portal)
 *   membership_types includes "campaign_member"  -> allow
 *   otherwise (social-only)                      -> deny
 *
 * Denied visitors are redirected to the dashboard they DO have, never
 * to a page they cannot use.
 */
export default function CampaignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const isAdmin = profile?.access_role === "admin";
  const isElectionOfficer = profile?.access_role === "election_officer";
  const isCampaignMember =
    profile?.membership_types?.includes("campaign_member") ?? false;

  const allowed = isAdmin || (!isElectionOfficer && isCampaignMember);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (!allowed) {
      router.replace(
        isElectionOfficer ? "/portal/election" : "/portal/dashboard",
      );
    }
  }, [allowed, isElectionOfficer, loading, router, user]);

  if (loading || (!profile && user)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Checking campaign access…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-gray-500">Redirecting…</p>
      </div>
    );
  }

  return <>{children}</>;
}
