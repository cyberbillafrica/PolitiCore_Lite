"use client";

import { useAuth } from "@/contexts/AuthContext";
import SocialMemberDashboard from "@/components/dashboard/SocialMemberDashboard";
import CampaignDashboard from "@/components/dashboard/CampaignDashboard";
import ElectionOfficerDashboard from "@/components/dashboard/ElectionOfficerDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  const { profile, loading } = useAuth();

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

  // Social members get the social dashboard.
  if (profile.membership_types?.includes("social_member")) {
    return <SocialMemberDashboard />;
  }

  // Campaign members get the campaign dashboard.
  return <CampaignDashboard />;
}

