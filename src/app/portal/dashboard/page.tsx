"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import SocialMemberDashboard from "@/components/dashboard/SocialMemberDashboard";
import CampaignDashboard from "@/components/dashboard/CampaignDashboard";
import ElectionOfficerDashboard from "@/components/dashboard/ElectionOfficerDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import { cn } from "@/lib/utils";
import { BriefcaseBusiness, Loader2, TrendingUp } from "lucide-react";

/*
 * ============================================================
 * DASHBOARD VIEW SWITCHER
 * ============================================================
 *
 * A user may hold both membership types (`campaign_member` and
 * `social_member`). Before this, such a user only ever saw the social
 * dashboard. They can now switch, and the choice survives a reload.
 *
 * The switch is shown ONLY when both memberships are present. Every
 * other case keeps the previous single-dashboard behaviour exactly:
 * admin and election officer retain their own dashboards, and a single
 * membership type renders that one dashboard with no switcher.
 */

const VIEW_STORAGE_KEY = "politicore.dashboard.memberView";

type MemberView = "social" | "campaign";

export default function DashboardPage() {
  const { profile, loading } = useAuth();

  const [view, setView] = useState<MemberView>("social");

  /*
   * Restore the persisted view once on mount. Storage can be unavailable
   * (private mode / SSR), in which case the default stands.
   */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "social" || stored === "campaign") {
        /* eslint-disable-next-line react-hooks/set-state-in-effect */
        setView(stored);
      }
    } catch {
      /* Storage is unavailable — keep the default view. */
    }
  }, []);

  const chooseView = (next: MemberView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* Storage is unavailable — the choice simply does not persist. */
    }
  };

  if (loading || !profile) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading your dashboard…
      </div>
    );
  }

  /*
   * Dashboard routing is based on authority first,
   * then membership type.
   *
   * Admin and Election Officer are access roles.
   * Social Member and Campaign Member are membership types.
   */

  // Highest portal authority.
  if (profile.access_role === "admin") {
    return <AdminDashboard />;
  }

  // Election operations authority.
  if (profile.access_role === "election_officer") {
    return <ElectionOfficerDashboard />;
  }

  const isSocialMember =
    profile.membership_types?.includes("social_member") ?? false;

  const isCampaignMember =
    profile.membership_types?.includes("campaign_member") ?? false;

  // A single membership type keeps the original, switcher-less behaviour.
  if (!isSocialMember || !isCampaignMember) {
    return isSocialMember ? <SocialMemberDashboard /> : <CampaignDashboard />;
  }

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Dashboard view"
        className="inline-flex w-full max-w-md items-center gap-1 rounded-xl border bg-white p-1 shadow-sm sm:w-auto"
      >
        <SwitcherButton
          active={view === "social"}
          icon={<TrendingUp className="h-4 w-4" />}
          label="Social View"
          onClick={() => chooseView("social")}
        />

        <SwitcherButton
          active={view === "campaign"}
          icon={<BriefcaseBusiness className="h-4 w-4" />}
          label="Campaign View"
          onClick={() => chooseView("campaign")}
        />
      </div>

      {view === "social" ? <SocialMemberDashboard /> : <CampaignDashboard />}
    </div>
  );
}

function SwitcherButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:flex-none",
        active
          ? "bg-apc-primary text-white shadow-sm"
          : "text-gray-600 hover:bg-gray-100",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
