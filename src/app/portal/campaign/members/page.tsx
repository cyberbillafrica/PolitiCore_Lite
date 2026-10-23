"use client";

/*
 * ============================================================
 * MEMBER DIRECTORY
 * ============================================================
 *
 * Who the viewer may see, and nothing more:
 *
 *   Plain member  their own polling unit, read-only
 *   Coordinator   their scope and everything below it, read-only,
 *                 plus the coordinators operating inside it
 *   Admin         every campaign member, with filters
 *
 * Positions are NOT read off the profile. They are resolved from
 * `organizational_assignments` in one batch per page load, because the
 * assignment record is the authoritative source.
 */

import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useCampaignAuthority } from "@/hooks/useCampaignAuthority";
import { useElectoralLookup } from "@/hooks/useElectoralLookup";

import {
  getAllCampaignMembers,
  getCampaignMembersInScope,
  getMemberPositions,
  type ScopedCampaignMember,
} from "@/lib/firebase/campaignMembers";

import {
  formatOrganizationalPosition,
  formatScopeType,
} from "@/lib/organization";

import { notify } from "@/lib/notify";

import type { OrganizationalPosition, ScopeType } from "@/types";

/* ============================================================
 * CONSTANTS
 * ============================================================ */

const COORDINATOR_RANKS: OrganizationalPosition[] = [
  "state_coordinator",
  "zone_coordinator",
  "lga_coordinator",
  "ward_coordinator",
  "pu_coordinator",
];

const ROLE_OPTIONS = ["admin", "member", "election_officer"] as const;

const POSITION_OPTIONS: OrganizationalPosition[] = [
  "state_coordinator",
  "zone_coordinator",
  "lga_coordinator",
  "ward_coordinator",
  "pu_coordinator",
  "campaign_member",
];

type PositionInfo = {
  position: OrganizationalPosition;
  level: string;
  scope_id: string;
};

/* ============================================================
 * PAGE
 * ============================================================ */

export default function CampaignMembersPage() {
  const {
    profile,
    loading,
    isAdmin,
    isCoordinator,
    scope,
    scopeLabel,
    grants,
  } = useCampaignAuthority();

  const lookup = useElectoralLookup();

  const [members, setMembers] = useState<ScopedCampaignMember[]>([]);
  const [positions, setPositions] = useState<Map<string, PositionInfo>>(
    new Map(),
  );

  const [dataLoading, setDataLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [wardFilter, setWardFilter] = useState("");
  const [puFilter, setPuFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");

  /* ------------------------------------------------------------
   * LOAD
   * ------------------------------------------------------------ */

  const load = useCallback(async () => {
    if (!profile) {
      setDataLoading(false);
      return;
    }

    if (!isAdmin && !scope) {
      setMembers([]);
      setPositions(new Map());
      setDataLoading(false);
      return;
    }

    setDataLoading(true);

    try {
      const list = isAdmin
        ? await getAllCampaignMembers()
        : scope
          ? await getCampaignMembersInScope(scope, grants)
          : [];

      setMembers(list);

      if (list.length > 0) {
        setPositions(
          await getMemberPositions(
            list.map((member) => member.id),
            scope,
            grants,
          ),
        );
      } else {
        setPositions(new Map());
      }
    } catch (error) {
      console.error("Failed to load the member directory:", error);
      notify.error("Unable to load the member directory right now.");
      setMembers([]);
      setPositions(new Map());
    } finally {
      setDataLoading(false);
    }
  }, [grants, isAdmin, profile, scope]);

  useEffect(() => {
    if (loading) return;

    void load();
  }, [load, loading]);

  /* ------------------------------------------------------------
   * FILTER OPTIONS
   * ------------------------------------------------------------ */

  const wardOptions = useMemo(() => {
    const ids = Array.from(
      new Set(members.map((member) => member.ward_id).filter(Boolean)),
    );

    return ids
      .map((id) => ({ id, label: lookup.wardLabel(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [members, lookup]);

  const pollingUnitOptions = useMemo(() => {
    const ids = Array.from(
      new Set(
        members
          .filter((member) => !wardFilter || member.ward_id === wardFilter)
          .map((member) => member.polling_unit_id)
          .filter(Boolean),
      ),
    );

    return ids.map((id) => {
      const member = members.find((item) => item.polling_unit_id === id);

      return {
        id,
        label: lookup.pollingUnitLabel(member?.ward_id, id),
      };
    });
  }, [members, lookup, wardFilter]);

  /* ------------------------------------------------------------
   * FILTERED MEMBERS
   * ------------------------------------------------------------ */

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return members.filter((member) => {
      if (term) {
        const haystack = [
          member.full_name ?? "",
          member.email ?? "",
          member.phone ?? "",
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(term)) return false;
      }

      if (isAdmin) {
        if (wardFilter && member.ward_id !== wardFilter) return false;
        if (puFilter && member.polling_unit_id !== puFilter) return false;
        if (roleFilter && member.access_role !== roleFilter) return false;

        if (positionFilter) {
          const position =
            positions.get(member.id)?.position ?? "campaign_member";

          if (position !== positionFilter) return false;
        }
      }

      return true;
    });
  }, [
    isAdmin,
    members,
    positionFilter,
    positions,
    puFilter,
    roleFilter,
    search,
    wardFilter,
  ]);

  const coordinators = useMemo(
    () =>
      members.filter((member) => {
        const position = positions.get(member.id)?.position;
        return position ? COORDINATOR_RANKS.includes(position) : false;
      }),
    [members, positions],
  );

  const hasActiveFilter =
    Boolean(search.trim()) ||
    Boolean(wardFilter) ||
    Boolean(puFilter) ||
    Boolean(roleFilter) ||
    Boolean(positionFilter);

  function resetFilters() {
    setSearch("");
    setWardFilter("");
    setPuFilter("");
    setRoleFilter("");
    setPositionFilter("");
  }

  /* ------------------------------------------------------------
   * GUARDS
   * ------------------------------------------------------------ */

  if (!profile) return null;

  if (loading || dataLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-apc-primary" />

        <p className="text-sm text-gray-500">
          Loading your member directory…
        </p>
      </div>
    );
  }

  if (!isAdmin && !scope) {
    return (
      <div className="space-y-6 pb-8">
        <BackLink />

        <PageHeader />

        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-6">
            <div className="flex gap-4">
              <ShieldCheck className="h-6 w-6 shrink-0 text-yellow-600" />

              <div>
                <h2 className="font-semibold text-yellow-900">
                  No campaign area yet
                </h2>

                <p className="mt-1 max-w-2xl text-sm leading-8 text-yellow-800">
                  Your directory is drawn from your organizational position, or
                  from the polling unit you registered with. Neither is available
                  on your account yet, so there is no member list to show.
                </p>

                <Link
                  href="/portal/profile"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-yellow-900 underline"
                >
                  Update my registered area
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ------------------------------------------------------------
   * PAGE
   * ------------------------------------------------------------ */

  const directoryTitle = isAdmin
    ? "All campaign members"
    : scope?.level === "polling_unit"
      ? "Members in your polling unit"
      : "Members in your area";

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
                  {isAdmin
                    ? "Administrator view"
                    : isCoordinator
                      ? "Your authorized organizational scope"
                      : "Your registered polling unit"}
                </p>

                <h2 className="mt-1 text-xl font-bold text-gray-900">
                  {isAdmin
                    ? "State-wide directory"
                    : `${formatScopeType(scope?.level ?? null)} · ${scopeLabel}`}
                </h2>

                <p className="mt-1 text-sm text-gray-600">
                  {isAdmin
                    ? "Every campaign member, with filters by ward, polling unit, role and position."
                    : `Reading members inside ${scopeLabel}${
                        scope?.scope_id ? ` (${scope.scope_id})` : ""
                      }.`}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {isCoordinator || isAdmin
                  ? "Members in scope"
                  : "Members in your PU"}
              </p>

              <p className="mt-1 text-2xl font-bold text-gray-900">
                {members.length === 0 ? "None yet" : members.length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======================================================
          COORDINATORS IN AREA
          ====================================================== */}

      {!isAdmin && isCoordinator && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Coordinators in my area</CardTitle>

            <p className="text-sm text-gray-500">
              Positions operating inside your scope, with the area each one
              covers.
            </p>
          </CardHeader>

          <CardContent>
            {coordinators.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-gray-300" />

                <p className="mt-3 font-semibold text-gray-900">
                  No coordinators yet
                </p>

                <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                  No coordinator position has been assigned inside your area.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {coordinators.map((member) => (
                  <CoordinatorCard
                    key={member.id}
                    member={member}
                    position={positions.get(member.id)}
                  />
                ))}
              </div>
            )}
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
              <CardTitle className="text-lg">{directoryTitle}</CardTitle>

              <p className="mt-1 text-sm text-gray-500">
                {isAdmin
                  ? "Every registered campaign member."
                  : "Read-only view of the members you are authorized to see."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex w-fit items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
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
              placeholder={
                isAdmin
                  ? "Search by name, email or phone…"
                  : "Search members in your area…"
              }
              className="w-full rounded-xl border bg-white py-3 pl-10 pr-4 text-sm outline-none transition focus:border-apc-primary focus:ring-2 focus:ring-apc-primary/10"
            />
          </div>

          {/* ADMIN FILTERS */}

          {isAdmin && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FilterSelect
                id="filter-ward"
                label="Ward"
                value={wardFilter}
                onChange={(value) => {
                  setWardFilter(value);
                  setPuFilter("");
                }}
                options={wardOptions}
                allLabel="All wards"
              />

              <FilterSelect
                id="filter-pu"
                label="Polling unit"
                value={puFilter}
                onChange={setPuFilter}
                options={pollingUnitOptions}
                allLabel="All polling units"
              />

              <FilterSelect
                id="filter-role"
                label="Access role"
                value={roleFilter}
                onChange={setRoleFilter}
                options={ROLE_OPTIONS.map((role) => ({
                  id: role,
                  label: formatRole(role),
                }))}
                allLabel="All roles"
              />

              <FilterSelect
                id="filter-position"
                label="Position"
                value={positionFilter}
                onChange={setPositionFilter}
                options={POSITION_OPTIONS.map((position) => ({
                  id: position,
                  label: formatOrganizationalPosition(position),
                }))}
                allLabel="All positions"
              />

              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="w-fit rounded-lg border px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* LIST */}

          {members.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed p-10 text-center">
              <Users className="mx-auto h-10 w-10 text-gray-300" />

              <p className="mt-3 font-semibold text-gray-900">No members yet</p>

              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                {isAdmin
                  ? "No account has registered as a campaign member yet."
                  : "Nobody has registered inside your area yet. Members appear here as soon as they register."}
              </p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed p-10 text-center">
              <Search className="mx-auto h-10 w-10 text-gray-300" />

              <p className="mt-3 font-semibold text-gray-900">
                No members match your filters
              </p>

              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                Try a different search term, or clear the filters.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {filteredMembers.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  position={positions.get(member.id)}
                  showRole={isAdmin}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================
 * HEADER
 * ============================================================ */

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

/* ============================================================
 * BACK LINK
 * ============================================================ */

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

/* ============================================================
 * MEMBER ROW
 * ============================================================ */

function MemberRow({
  member,
  position,
  showRole,
}: {
  member: ScopedCampaignMember;
  position?: PositionInfo;
  showRole: boolean;
}) {
  const lookup = useElectoralLookup();

  const location = lookup.describe(
    member.lga_id,
    member.ward_id,
    member.polling_unit_id,
  );

  const socials = [
    member.facebook_profile_url,
    member.x_profile_url,
    member.instagram_profile_url,
    member.tiktok_profile_url,
  ].filter((value): value is string => Boolean(value));

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
              <span
                className={
                  position
                    ? "rounded-full bg-apc-primary/10 px-2.5 py-1 text-xs font-semibold text-apc-primary"
                    : "rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
                }
              >
                {formatOrganizationalPosition(position?.position ?? null)}
              </span>

              {position && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  {formatScopeType(position.level as ScopeType)} ·{" "}
                  {position.scope_id}
                </span>
              )}

              {showRole && member.access_role && (
                <span
                  className={
                    member.access_role === "admin"
                      ? "rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800"
                      : member.access_role === "election_officer"
                        ? "rounded-full bg-apc-primary/10 px-2.5 py-1 text-xs font-semibold text-apc-primary"
                        : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                  }
                >
                  {formatRole(member.access_role)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* LOCATION */}

        <div className="text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <MapPin className="h-4 w-4 text-gray-400" />

            <span>{location.wardLabel}</span>
          </div>

          <p className="mt-1 pl-6 text-xs text-gray-500">{location.lgaLabel}</p>

          <p className="mt-1 pl-6 text-xs text-gray-400">
            {location.pollingUnitLabel}
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

          {socials.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {socials.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                >
                  Social
                </a>
              ))}
            </div>
          )}
        </div>

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

/* ============================================================
 * COORDINATOR CARD
 * ============================================================ */

function CoordinatorCard({
  member,
  position,
}: {
  member: ScopedCampaignMember;
  position?: PositionInfo;
}) {
  const lookup = useElectoralLookup();

  return (
    <Link
      href={`/portal/campaign/members/${member.id}`}
      className="rounded-xl border p-4 transition hover:border-apc-primary/30 hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">
            {member.full_name || "Member"}
          </p>

          <p className="mt-1 text-sm font-medium text-apc-primary">
            {formatOrganizationalPosition(position?.position ?? null)}
          </p>

          <p className="mt-1 text-xs text-gray-500">
            {position
              ? `${formatScopeType(position.level as ScopeType)} · ${position.scope_id}`
              : "No scope recorded"}
          </p>
        </div>

        <ShieldCheck className="h-5 w-5 shrink-0 text-apc-primary" />
      </div>

      <p className="mt-3 text-xs text-gray-500">
        {lookup.wardLabel(member.ward_id)} ·{" "}
        {lookup.pollingUnitLabel(member.ward_id, member.polling_unit_id)}
      </p>
    </Link>
  );
}

/* ============================================================
 * FILTER SELECT
 * ============================================================ */

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ id: string; label: string }>;
  allLabel: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400"
      >
        {label}
      </label>

      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-apc-primary"
      >
        <option value="">{allLabel}</option>

        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ============================================================
 * ACCESS ROLE
 * ============================================================ */

function formatRole(role: string) {
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
