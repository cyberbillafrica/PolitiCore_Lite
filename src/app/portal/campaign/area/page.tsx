"use client";

/*
 * ============================================================
 * MY AREA
 * ============================================================
 *
 * Two variants, both driven by `useCampaignAuthority()`:
 *
 *   Plain member   read-only polling-unit stats. No create actions.
 *
 *   Coordinator    scope stats, permitted quick actions, a subordinate
 *                  level filter, and the members inside their area.
 *
 * This page previously used a local stub that always returned an empty
 * assignment list, so it rendered "no assignment" for everyone. It now
 * reads the resolved scope from the shared authority hook.
 */

import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  MapPin,
  Plus,
  ShieldCheck,
  TriangleAlert,
  Users,
  Vote,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useCampaignAuthority } from "@/hooks/useCampaignAuthority";
import { useElectoralLookup } from "@/hooks/useElectoralLookup";

import { deriveLgaIdFromWard } from "@/lib/election-scope";

import {
  formatOrganizationalPosition,
  formatScopeType,
} from "@/lib/organization";

import {
  getAssignmentsForUser,
  getAssignmentsInScope,
} from "@/lib/firebase/campaignAssignments";
import { getCampaignMembersInScope } from "@/lib/firebase/campaignMembers";
import { getActivitiesInScope } from "@/lib/firebase/campaignActivities";
import { getIssuesInScope } from "@/lib/firebase/campaignIssues";

import { notify } from "@/lib/notify";

import type { ScopedCampaignMember } from "@/lib/firebase/campaignMembers";
import type {
  CampaignActivity,
  CampaignAssignment,
  CampaignIssue,
  OrganizationalAssignment,
} from "@/types";

/* ============================================================
 * PAGE
 * ============================================================ */

export default function CampaignAreaPage() {
  const {
    profile,
    assignments,
    isAdmin,
    isCoordinator,
    scope,
    scopeLoading,
    scopeLabel,
    loading,
    canCreateAt,
  } = useCampaignAuthority();

  const lookup = useElectoralLookup();

  const [members, setMembers] = useState<ScopedCampaignMember[]>([]);
  const [activities, setActivities] = useState<CampaignActivity[]>([]);
  const [ownAssignments, setOwnAssignments] = useState<CampaignAssignment[]>([]);
  const [scopedAssignments, setScopedAssignments] = useState<CampaignAssignment[]>(
    [],
  );
  const [issues, setIssues] = useState<CampaignIssue[]>([]);

  const [dataLoading, setDataLoading] = useState(true);

  const [subordinateId, setSubordinateId] = useState("");

  const userId = profile?.id ?? "";

  /* ------------------------------------------------------------
   * LOAD
   * ------------------------------------------------------------ */

  const load = useCallback(async () => {
    if (!userId) {
      setMembers([]);
      setActivities([]);
      setOwnAssignments([]);
      setScopedAssignments([]);
      setIssues([]);
      setDataLoading(false);
      return;
    }

    if (!scope) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);

    try {
      const [memberList, activityList, mine] = await Promise.all([
        getCampaignMembersInScope(scope),
        getActivitiesInScope(scope),
        getAssignmentsForUser(userId),
      ]);

      setMembers(memberList);
      setActivities(activityList);
      setOwnAssignments(mine);

      if (isCoordinator) {
        const [areaAssignments, areaIssues] = await Promise.all([
          getAssignmentsInScope(
            { level: scope.level, scopeId: scope.scope_id },
            scope.wardIds,
            lookup.lgas,
          ),
          getIssuesInScope(scope),
        ]);

        setScopedAssignments(areaAssignments);
        setIssues(areaIssues);
      } else {
        setScopedAssignments([]);
        setIssues([]);
      }
    } catch (error) {
      console.error("Failed to load campaign area:", error);
      notify.error("Unable to load your campaign area right now.");
    } finally {
      setDataLoading(false);
    }
  }, [isCoordinator, lookup.lgas, scope, userId]);

  useEffect(() => {
    if (loading || scopeLoading) return;

    void load();
  }, [load, loading, scopeLoading]);

  /* Reset the subordinate filter when the area changes. */
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setSubordinateId("");
  }, [scope?.level, scope?.scope_id]);

  /* ------------------------------------------------------------
   * SUBORDINATE OPTIONS
   * ------------------------------------------------------------ */

  const subordinateOptions = useMemo<Array<{ id: string; label: string }>>(() => {
    if (!scope || !isCoordinator) return [];

    if (scope.level === "state" || scope.level === "senatorial_zone") {
      return scope.lgaIds.map((id) => ({
        id,
        label: `${lookup.lgaById(id)?.name ?? id} LGA`,
      }));
    }

    if (scope.level === "lga") {
      return scope.wardIds.map((id) => ({
        id,
        label: lookup.wardById(id)?.name ?? id,
      }));
    }

    if (scope.level === "ward") {
      return scope.pollingUnitIds.map((id) => ({
        id,
        label: pollingUnitShortLabel(id),
      }));
    }

    return [];
  }, [isCoordinator, lookup, scope]);

  const subordinateLabel =
    scope?.level === "state" || scope?.level === "senatorial_zone"
      ? "Filter by LGA"
      : scope?.level === "lga"
        ? "Filter by ward"
        : "Filter by polling unit";

  const visibleMembers = useMemo(() => {
    if (!scope || !subordinateId) return members;

    if (scope.level === "state" || scope.level === "senatorial_zone") {
      return members.filter(
        (member) =>
          (member.lga_id ||
            deriveLgaIdFromWard(lookup.lgas, member.ward_id)) === subordinateId,
      );
    }

    if (scope.level === "lga") {
      return members.filter((member) => member.ward_id === subordinateId);
    }

    if (scope.level === "ward") {
      return members.filter(
        (member) => member.polling_unit_id === subordinateId,
      );
    }

    return members;
  }, [lookup.lgas, members, scope, subordinateId]);

  /* ------------------------------------------------------------
   * STATS
   * ------------------------------------------------------------ */

  const stats = useMemo(() => {
    const openAssignments = isCoordinator
      ? scopedAssignments.filter((item) => item.status === "open").length
      : ownAssignments.filter((item) => item.status === "open").length;

    return {
      members: members.length,
      pollingUnits: scope?.pollingUnitIds.length ?? 0,
      openAssignments,
      completedAssignments: ownAssignments.filter(
        (item) => item.status === "closed",
      ).length,
      openIssues: issues.filter((item) => item.status !== "resolved").length,
      activities: activities.length,
    };
  }, [activities, isCoordinator, issues, members, ownAssignments, scope, scopedAssignments]);

  const canCreateHere = scope
    ? canCreateAt({ level: scope.level, scopeId: scope.scope_id })
    : false;

  const registered = lookup.describe(
    profile?.lga_id,
    profile?.ward_id,
    profile?.polling_unit_id,
  );

  /* ------------------------------------------------------------
   * GUARDS
   * ------------------------------------------------------------ */

  if (!profile) return null;

  if (loading || scopeLoading || dataLoading) {
    return <CampaignAreaLoading />;
  }

  if (!scope) {
    return (
      <div className="space-y-6 pb-8">
        <BackLink />

        <PageHeader
          title="My Campaign Area"
          description="Your organizational responsibility within the campaign."
        />

        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-6">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yellow-100">
                <TriangleAlert className="h-5 w-5 text-yellow-700" />
              </div>

              <div>
                <h2 className="font-semibold text-yellow-900">
                  No campaign area yet
                </h2>

                <p className="mt-1 max-w-2xl text-sm leading-6 text-yellow-800">
                  Your area is derived from your organizational assignment, or
                  from the polling unit you registered with. Neither is available
                  on your account yet.
                </p>

                <p className="mt-3 text-sm text-yellow-800">
                  An administrator can assign you a position and scope; you can
                  also complete your registered ward and polling unit in your
                  profile.
                </p>

                <Link
                  href="/portal/profile"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-yellow-900 underline"
                >
                  Update my registered area
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <RegisteredArea
          wardLabel={registered.wardLabel}
          pollingUnitLabel={registered.pollingUnitLabel}
        />
      </div>
    );
  }

  /* ------------------------------------------------------------
   * PAGE
   * ------------------------------------------------------------ */

  const positionLabel = isCoordinator
    ? formatOrganizationalPosition(
        assignments.find((item) => item.status === "active")?.position ?? null,
      )
    : "Campaign Member";

  return (
    <div className="space-y-6 pb-8">
      <BackLink />

      <PageHeader
        title="My Campaign Area"
        description={
          isCoordinator
            ? "Your organizational responsibility and everything inside it."
            : "Your polling unit and your own campaign work."
        }
      />

      {/* ======================================================
          AUTHORITY CARD
          ====================================================== */}

      <Card className="overflow-hidden border-apc-primary/20">
        <div className="bg-apc-primary px-6 py-5 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-white/70">
                {isCoordinator ? "Your position" : "Your area"}
              </p>

              <h2 className="mt-1 text-2xl font-bold">
                {isAdmin ? `${positionLabel} · Admin` : positionLabel}
              </h2>

              <p className="mt-1 text-sm text-white/75">
                {scopeLabel}
                {scope.scope_id ? ` · ${scope.scope_id}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4" />

              {isCoordinator ? "Active assignment" : "Read-only area"}
            </div>
          </div>
        </div>

        <CardContent className="grid gap-4 p-6 md:grid-cols-3">
          <AreaInfo
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Authority level"
            value={formatScopeType(scope.level)}
          />

          <AreaInfo
            icon={<MapPin className="h-4 w-4" />}
            label="Scope"
            value={scope.label || scope.scope_id}
          />

          <AreaInfo
            icon={<Vote className="h-4 w-4" />}
            label="Polling units covered"
            value={
              scope.pollingUnitIds.length === 0
                ? "None resolved"
                : String(scope.pollingUnitIds.length)
            }
          />
        </CardContent>
      </Card>

      {/* ======================================================
          SCOPE STATS
          ====================================================== */}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Users className="h-5 w-5" />}
          title={isCoordinator ? "Members in scope" : "Members in your PU"}
          value={
            stats.members === 0 ? "No members yet" : String(stats.members)
          }
          description={
            isCoordinator
              ? "Everyone registered inside your area"
              : "Members registered at your polling unit"
          }
          muted={stats.members === 0}
        />

        <SummaryCard
          icon={<Vote className="h-5 w-5" />}
          title="Polling units"
          value={
            stats.pollingUnits === 0 ? "None resolved" : String(stats.pollingUnits)
          }
          description="Polling units inside your area"
          muted={stats.pollingUnits === 0}
        />

        <SummaryCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          title={isCoordinator ? "Open assignments" : "My open assignments"}
          value={
            stats.openAssignments === 0
              ? "No assignments yet"
              : String(stats.openAssignments)
          }
          description={
            isCoordinator
              ? "Assignments targeting your area"
              : "Work assigned directly to you"
          }
          muted={stats.openAssignments === 0}
        />

        {isCoordinator ? (
          <SummaryCard
            icon={<TriangleAlert className="h-5 w-5" />}
            title="Open issues"
            value={
              stats.openIssues === 0 ? "No issues yet" : String(stats.openIssues)
            }
            description="Issues raised in your area, not yet resolved"
            muted={stats.openIssues === 0}
          />
        ) : (
          <SummaryCard
            icon={<CalendarDays className="h-5 w-5" />}
            title="Activities"
            value={
              stats.activities === 0
                ? "No activities yet"
                : String(stats.activities)
            }
            description="Activities visible in your area"
            muted={stats.activities === 0}
          />
        )}
      </div>

      {/* ======================================================
          QUICK ACTIONS (COORDINATORS)
          ====================================================== */}

      {isCoordinator && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What you can do here</CardTitle>

            <p className="text-sm text-gray-500">
              Actions available at your level within {scopeLabel}.
            </p>
          </CardHeader>

          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {canCreateHere && (
                <AreaAction
                  icon={<CalendarDays className="h-5 w-5" />}
                  title="Create activity"
                  description="Organise a meeting, rally or outreach in your area."
                  href="/portal/campaign/activities"
                />
              )}

              {canCreateHere && (
                <AreaAction
                  icon={<Plus className="h-5 w-5" />}
                  title="Create assignment"
                  description="Assign work to a member or a scope inside your area."
                  href="/portal/campaign/assignments"
                />
              )}

              <AreaAction
                icon={<FileText className="h-5 w-5" />}
                title="View reports received"
                description="Reports submitted against assignments you created."
                href="/portal/campaign/reports"
              />

              <AreaAction
                icon={<TriangleAlert className="h-5 w-5" />}
                title="View issues"
                description="Issues raised by members anywhere inside your area."
                href="/portal/campaign/issues"
              />
            </div>

            {!canCreateHere && (
              <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-gray-500">
                Your position can read this area but cannot create activities or
                assignments at this level.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ======================================================
          MEMBERS IN AREA
          ====================================================== */}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">
                {isCoordinator ? "Members in your area" : "Your polling unit"}
              </CardTitle>

              <p className="mt-1 text-sm text-gray-500">
                {isCoordinator
                  ? "Members registered inside your scope and everything below it."
                  : "Members registered at the same polling unit as you."}
              </p>
            </div>

            {isCoordinator && subordinateOptions.length > 0 && (
              <div className="w-full sm:w-64">
                <label
                  htmlFor="subordinate-filter"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400"
                >
                  {subordinateLabel}
                </label>

                <select
                  id="subordinate-filter"
                  value={subordinateId}
                  onChange={(event) => setSubordinateId(event.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-apc-primary"
                >
                  <option value="">All</option>

                  {subordinateOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {visibleMembers.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No members yet"
              description={
                subordinateId
                  ? "Nobody is registered in the selected part of your area."
                  : "Nobody has registered inside your area yet."
              }
            />
          ) : (
            <div className="space-y-2">
              {visibleMembers.slice(0, 12).map((member) => (
                <Link
                  key={member.id}
                  href={`/portal/campaign/members/${member.id}`}
                  className="flex items-center gap-3 rounded-xl border p-3 transition hover:bg-gray-50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-apc-primary/10 text-sm font-bold text-apc-primary">
                    {member.full_name?.charAt(0)?.toUpperCase() ?? "M"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {member.full_name || "Member"}
                    </p>

                    <p className="truncate text-xs text-gray-500">
                      {lookup.wardLabel(member.ward_id)} ·{" "}
                      {lookup.pollingUnitLabel(
                        member.ward_id,
                        member.polling_unit_id,
                      )}
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                </Link>
              ))}

              {visibleMembers.length > 12 && (
                <Link
                  href="/portal/campaign/members"
                  className="inline-flex items-center gap-1 pt-2 text-sm font-semibold text-apc-primary hover:underline"
                >
                  View all {visibleMembers.length} members
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ======================================================
          ACTIVITIES
          ====================================================== */}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activities in your area</CardTitle>

          <p className="text-sm text-gray-500">
            The most relevant activities visible from your scope.
          </p>
        </CardHeader>

        <CardContent>
          {activities.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-8 w-8" />}
              title="No activities yet"
              description="No campaign activity has been scheduled for your area."
            />
          ) : (
            <div className="space-y-2">
              {activities.slice(0, 5).map((activity) => (
                <div
                  key={activity.id}
                  className="flex flex-col gap-1 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {activity.title}
                    </p>

                    <p className="text-xs text-gray-500">
                      {formatScopeType(activity.scope_type)} · {activity.scope_id}
                      {activity.venue ? ` · ${activity.venue}` : ""}
                    </p>
                  </div>

                  <span className="w-fit shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                    {activity.date || "No date"}
                  </span>
                </div>
              ))}

              <Link
                href="/portal/campaign/activities"
                className="inline-flex items-center gap-1 pt-2 text-sm font-semibold text-apc-primary hover:underline"
              >
                View all activities
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ======================================================
          MY ASSIGNMENTS
          ====================================================== */}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">My organizational assignments</CardTitle>

          <p className="text-sm text-gray-500">
            Positions recorded against your account.
          </p>
        </CardHeader>

        <CardContent>
          {assignments.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-8 w-8" />}
              title="No position assigned yet"
              description="You participate as a campaign member. An administrator can assign you a coordinating position."
            />
          ) : (
            <div className="space-y-3">
              {assignments.map((item) => (
                <AssignmentRow key={item.id} assignment={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ======================================================
          REGISTERED AREA
          ====================================================== */}

      <RegisteredArea
        wardLabel={registered.wardLabel}
        pollingUnitLabel={registered.pollingUnitLabel}
      />
    </div>
  );
}

/* ============================================================
 * HELPERS
 * ============================================================ */

function pollingUnitShortLabel(pollingUnitId: string): string {
  const tail = pollingUnitId.split("-pu-").pop();

  return tail ? `PU ${tail.toUpperCase()}` : pollingUnitId;
}

/* ============================================================
 * PAGE HEADER
 * ============================================================ */

function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-apc-primary">Campaign Council</p>

      <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
        {title}
      </h1>

      <p className="mt-2 text-gray-600">{description}</p>
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
      className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-apc-primary"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Campaign Dashboard
    </Link>
  );
}

/* ============================================================
 * AREA INFO
 * ============================================================ */

function AreaInfo({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-gray-50 p-4">
      <div className="flex items-center gap-2 text-gray-400">
        {icon}

        <span className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>

      <p className="mt-2 font-semibold text-gray-900">{value}</p>
    </div>
  );
}

/* ============================================================
 * SUMMARY CARD
 * ============================================================ */

function SummaryCard({
  icon,
  title,
  value,
  description,
  muted = false,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  description: string;
  muted?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-apc-primary/10 text-apc-primary">
            {icon}
          </div>

          <span
            className={`text-right text-sm font-bold ${
              muted ? "text-gray-400" : "text-gray-900"
            }`}
          >
            {value}
          </span>
        </div>

        <p className="mt-4 font-semibold text-gray-900">{title}</p>

        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * AREA ACTION
 * ============================================================ */

function AreaAction({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border p-4 transition-all hover:border-apc-primary/30 hover:bg-gray-50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-apc-primary/10 text-apc-primary">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-900">{title}</p>

        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-apc-primary" />
    </Link>
  );
}

/* ============================================================
 * EMPTY STATE
 * ============================================================ */

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
        {icon}
      </div>

      <p className="mt-3 font-semibold text-gray-900">{title}</p>

      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
        {description}
      </p>
    </div>
  );
}

/* ============================================================
 * ASSIGNMENT ROW
 * ============================================================ */

function AssignmentRow({
  assignment,
}: {
  assignment: OrganizationalAssignment;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-apc-primary/10 text-apc-primary">
        <ShieldCheck className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-900">
          {formatOrganizationalPosition(assignment.position)}
        </p>

        <p className="mt-1 text-sm text-gray-500">
          {formatScopeType(assignment.scope_type)}
          {" · "}
          {assignment.scope_id}
        </p>
      </div>

      <span className="w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
        {formatAssignmentStatus(assignment.status)}
      </span>
    </div>
  );
}

/* ============================================================
 * REGISTERED ELECTORAL AREA
 * ============================================================ */

function RegisteredArea({
  wardLabel,
  pollingUnitLabel,
}: {
  wardLabel: string;
  pollingUnitLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">My registered electoral area</CardTitle>

        <p className="text-sm text-gray-500">
          Your personal electoral registration is separate from your campaign
          organizational responsibility.
        </p>
      </CardHeader>

      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <AreaInfo
            icon={<MapPin className="h-4 w-4" />}
            label="Registered ward"
            value={wardLabel}
          />

          <AreaInfo
            icon={<MapPin className="h-4 w-4" />}
            label="Registered polling unit"
            value={pollingUnitLabel}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * LOADING
 * ============================================================ */

function CampaignAreaLoading() {
  return (
    <div className="space-y-6 pb-8">
      <div className="h-5 w-40 animate-pulse rounded bg-gray-100" />

      <div className="space-y-3">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-100" />
        <div className="h-5 w-96 max-w-full animate-pulse rounded bg-gray-100" />
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="h-8 w-64 animate-pulse rounded bg-gray-100" />

          <div className="grid gap-4 md:grid-cols-3">
            <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================
 * STATUS FORMATTER
 * ============================================================ */

function formatAssignmentStatus(
  status: OrganizationalAssignment["status"],
): string {
  switch (status) {
    case "active":
      return "Active";

    case "inactive":
      return "Inactive";

    case "suspended":
      return "Suspended";

    case "expired":
      return "Expired";

    default:
      return status;
  }
}

