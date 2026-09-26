"use client";

import Link from "next/link";

import {
  ArrowLeft,
  ArrowRight,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  AlertTriangle,
  Loader2,
} from "lucide-react";

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useAuth } from "@/contexts/AuthContext";

import { getWardById, getPollingUnitById } from "@/lib/constants";

import { useOrganizationalAssignments } from "@/hooks/useOrganizationalAssignments";

import { useScopedCampaignMembers } from "@/hooks/useScopedCampaignMembers";

import {
  formatScopeType,
  getPrimaryOrganizationalScope,
} from "@/lib/organization";

import type { OrganizationalPosition } from "@/types";

/*
 * ============================================================
 * PAGE
 * ============================================================
 */

export default function CampaignMembersPage() {
  const { profile } = useAuth();

  const { assignments, loading: assignmentsLoading } =
    useOrganizationalAssignments();

  /*
   * ----------------------------------------------------------
   * PRIMARY ASSIGNMENT
   * ----------------------------------------------------------
   */

  const primaryScope = getPrimaryOrganizationalScope(assignments);

  const assignment = primaryScope.assignment;

  /*
   * ----------------------------------------------------------
   * MEMBERS
   * ----------------------------------------------------------
   */

  const {
    members,
    loading: membersLoading,
    error,
    scopeSupported,
    refresh,
  } = useScopedCampaignMembers(assignment);

  /*
   * ----------------------------------------------------------
   * SEARCH
   * ----------------------------------------------------------
   */

  const [search, setSearch] = useState("");

  /*
   * ----------------------------------------------------------
   * FILTERED MEMBERS
   * ----------------------------------------------------------
   */

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return members;
    }

    return members.filter((member) => {
      return (
        member.full_name?.toLowerCase().includes(term) ||
        member.email?.toLowerCase().includes(term) ||
        member.phone?.toLowerCase().includes(term)
      );
    });
  }, [members, search]);

  /*
   * ----------------------------------------------------------
   * AUTH
   * ----------------------------------------------------------
   */

  if (!profile) {
    return null;
  }

  /*
   * ----------------------------------------------------------
   * LOADING
   * ----------------------------------------------------------
   */

  if (assignmentsLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-apc-primary" />

        <p className="text-sm text-gray-500">
          Loading your organizational scope...
        </p>
      </div>
    );
  }

  /*
   * ----------------------------------------------------------
   * NO ASSIGNMENT
   * ----------------------------------------------------------
   */

  if (!assignment) {
    return (
      <div className="space-y-6 pb-8">
        <BackLink />

        <PageHeader />

        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-6">
            <div className="flex gap-4">
              <AlertTriangle className="h-6 w-6 shrink-0 text-yellow-600" />

              <div>
                <h2 className="font-semibold text-yellow-900">
                  No organizational assignment
                </h2>

                <p className="mt-1 text-sm text-yellow-800">
                  You must have an active campaign organizational assignment
                  before you can view a scoped member directory.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /*
   * ----------------------------------------------------------
   * PAGE
   * ----------------------------------------------------------
   */

  return (
    <div className="space-y-6 pb-8">
      <BackLink />

      <PageHeader />

      {/* ======================================================
          SCOPE SUMMARY
          ====================================================== */}

      <Card className="border-apc-primary/10">
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-apc-primary/10 text-apc-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>

              <div>
                <p className="text-sm text-gray-500">
                  Your authorized organizational scope
                </p>

                <h2 className="mt-1 text-xl font-bold text-gray-900">
                  {formatPosition(assignment.position)}
                </h2>

                <p className="mt-1 text-sm text-gray-600">
                  {formatScopeType(assignment.scope_type)}
                  {" · "}
                  {assignment.scope_id}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Members in scope
              </p>

              <p className="mt-1 text-2xl font-bold text-gray-900">
                {membersLoading ? "..." : members.length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======================================================
          UNSUPPORTED HIGHER SCOPE
          ====================================================== */}

      {!scopeSupported && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-5">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-600" />

              <div>
                <p className="font-semibold text-yellow-900">
                  Geographic scope expansion required
                </p>

                <p className="mt-1 text-sm leading-6 text-yellow-800">
                  Your assignment is above ward level. The member directory
                  needs the electoral hierarchy resolver to translate that scope
                  into its wards and polling units.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ======================================================
          DIRECTORY
          ====================================================== */}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-lg">
                Campaign Member Directory
              </CardTitle>

              <p className="mt-1 text-sm text-gray-500">
                Members within your authorized campaign area.
              </p>
            </div>

            <button
              type="button"
              onClick={refresh}
              disabled={membersLoading}
              className="inline-flex w-fit items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${membersLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </CardHeader>

        <CardContent>
          {/* SEARCH */}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search members by name, email or phone..."
              className="w-full rounded-xl border bg-white py-3 pl-10 pr-4 text-sm outline-none transition focus:border-apc-primary focus:ring-2 focus:ring-apc-primary/10"
            />
          </div>

          {/* ERROR */}

          {error && scopeSupported && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}

          {/* LOADING */}

          {membersLoading ? (
            <DirectoryLoading />
          ) : !scopeSupported ? (
            <div className="py-12 text-center">
              <Users className="mx-auto h-12 w-12 text-gray-300" />

              <p className="mt-4 font-semibold text-gray-900">
                Member directory not available for this scope yet
              </p>

              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                Your organizational assignment is valid, but the electoral
                hierarchy needed to resolve this geographic scope has not yet
                been connected.
              </p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="mx-auto h-12 w-12 text-gray-300" />

              <p className="mt-4 font-semibold text-gray-900">
                {search ? "No matching members" : "No campaign members found"}
              </p>

              <p className="mt-2 text-sm text-gray-500">
                {search
                  ? "Try a different search term."
                  : "There are currently no campaign members in this scope."}
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {filteredMembers.map((member) => (
                <MemberRow key={member.id} member={member} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/*
 * ============================================================
 * HEADER
 * ============================================================
 */

function PageHeader() {
  return (
    <div>
      <p className="text-sm font-semibold text-apc-primary">Campaign Council</p>

      <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
        Member Directory
      </h1>

      <p className="mt-2 text-gray-600">
        View campaign members within your organizational area.
      </p>
    </div>
  );
}

/*
 * ============================================================
 * BACK LINK
 * ============================================================
 */

function BackLink() {
  return (
    <Link
      href="/portal/dashboard"
      className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-apc-primary"
    >
      <ArrowLeft className="h-4 w-4" />
      Campaign Dashboard
    </Link>
  );
}

/*
 * ============================================================
 * MEMBER ROW
 * ============================================================
 */

function MemberRow({
  member,
}: {
  member: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    ward_id: string;
    polling_unit_id: string;
    membership_types: string[];
  };
}) {
  const ward = getWardById(member.ward_id);

  const pollingUnit = getPollingUnitById(
    member.ward_id,
    member.polling_unit_id,
  );

  return (
    <div className="rounded-xl border p-4 transition-colors hover:bg-gray-50">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* IDENTITY */}

        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-apc-primary/10 font-bold text-apc-primary">
            {member.full_name?.charAt(0)?.toUpperCase() ?? "M"}
          </div>

          <div>
            <p className="font-semibold text-gray-900">
              {member.full_name || "Member"}
            </p>

            <div className="mt-1 flex flex-wrap gap-2">
              {member.membership_types?.map((type) => (
                <span
                  key={type}
                  className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
                >
                  {formatMembership(type)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* LOCATION */}

        <div className="text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <MapPin className="h-4 w-4 text-gray-400" />

            <span>{ward ? ward.name : member.ward_id}</span>
          </div>

          <p className="mt-1 pl-6 text-xs text-gray-400">
            {pollingUnit ? pollingUnit.name : member.polling_unit_id}
          </p>
        </div>

        {/* CONTACT */}

        <div className="space-y-1 text-sm text-gray-500">
          {member.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" />

              <span>{member.phone}</span>
            </div>
          )}

          {member.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />

              <span className="truncate">{member.email}</span>
            </div>
          )}
        </div>

        {/* FUTURE PROFILE */}

        <Link
          href={`/portal/campaign/members/${member.id}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-apc-primary hover:underline"
        >
          View
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

/*
 * ============================================================
 * LOADING
 * ============================================================
 */

function DirectoryLoading() {
  return (
    <div className="mt-5 space-y-3">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="h-24 animate-pulse rounded-xl bg-gray-100" />
      ))}
    </div>
  );
}

/*
 * ============================================================
 * POSITION
 * ============================================================
 */

function formatPosition(position: OrganizationalPosition) {
  const labels: Record<OrganizationalPosition, string> = {
    campaign_member: "Campaign Member",
    ward_coordinator: "Ward Coordinator",
    lga_coordinator: "LGA Coordinator",
    zone_coordinator: "Zone Coordinator",
    state_coordinator: "State Coordinator",
    campaign_manager: "Campaign Manager",
    council_chairman: "Council Chairman",
  };

  return labels[position];
}

/*
 * ============================================================
 * MEMBERSHIP
 * ============================================================
 */

function formatMembership(membership: string) {
  return membership
    .replace("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

