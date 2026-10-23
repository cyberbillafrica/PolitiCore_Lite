"use client";

/*
 * ============================================================
 * CAMPAIGN DASHBOARD — SCOPE-AWARE SUMMARY
 * ============================================================
 *
 * This is the campaign variant of /portal/dashboard. Routing is owned
 * by src/app/portal/dashboard/page.tsx and is deliberately unchanged.
 *
 * What changed in Round 5: the page used to render an assignment card
 * plus a wall of static navigation, with every count printed as "—".
 * It now loads the numbers its viewer is allowed to see, through the
 * shared scope resolver:
 *
 *   plain member   -> their own PU: own assignments, own issues,
 *                     PU members, activities visible to them
 *   coordinator    -> their scope and everything below it: members,
 *                     polling units, open assignments, pending
 *                     reports received, open issues, recent activities
 *   admin          -> the same summary statewide
 *
 * Authority itself is never re-derived here: `useCampaignAuthority`
 * is the single source of "where does this person operate".
 */

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import {
  ArrowRight,
  CalendarDays,
  CheckSquare,
  CircleAlert,
  FileText,
  Flag,
  Loader2,
  MapPin,
  Network,
  ShieldCheck,
  Users,
  Vote,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useCampaignAuthority } from "@/hooks/useCampaignAuthority";
import { useElectoralLookup } from "@/hooks/useElectoralLookup";

import {
  describeScope,
  resolveCampaignScope,
  type CampaignScope,
} from "@/lib/campaign-scope";

import {
  getAssignmentsForUser,
  getAssignmentsInScope,
} from "@/lib/firebase/campaignAssignments";
import {
  getActivitiesInScope,
  type CampaignActivityRecord,
} from "@/lib/firebase/campaignActivities";
import { getCampaignMembersInScope } from "@/lib/firebase/campaignMembers";
import {
  getIssuesInScope,
  getMyCampaignIssues,
} from "@/lib/firebase/campaignIssues";
import {
  getAllCampaignReports,
  getReportsReceived,
} from "@/lib/firebase/campaignReports";

import { formatOrganizationalPosition } from "@/lib/organization";
import { notify } from "@/lib/notify";

import type { CampaignAssignment, CampaignIssue, CampaignReport } from "@/types";

/* ============================================================
 * OVERVIEW MODEL
 * ============================================================ */

interface CampaignOverview {
  members: number;
  pollingUnits: number;
  openAssignments: number;
  pendingReports: number;
  openIssues: number;

  activities: CampaignActivityRecord[];
  issues: CampaignIssue[];

  myAssignments: CampaignAssignment[];
  myIssues: CampaignIssue[];
}

const EMPTY_OVERVIEW: CampaignOverview = {
  members: 0,
  pollingUnits: 0,
  openAssignments: 0,
  pendingReports: 0,
  openIssues: 0,
  activities: [],
  issues: [],
  myAssignments: [],
  myIssues: [],
};

function countOpenIssues(issues: CampaignIssue[]): number {
  return issues.filter((issue) => issue.status === "open").length;
}

/**
 * Numeric tile value that never renders a bare "0": an empty count
 * reads as language, not as a statistic.
 */
function countLabel(value: number, emptyLabel: string): string {
  return value > 0 ? String(value) : emptyLabel;
}

function formatActivityDate(date: string): string {
  if (!date) return "Date not set";

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function CampaignDashboard() {
  const {
    profile,
    loading,
    isAdmin,
    isCoordinator,
    scope,
    scopeLoading,
    scopeLabel,
    authority,
  } = useCampaignAuthority();

  const lookup = useElectoralLookup();
  const lgas = lookup.lgas;

  const [overview, setOverview] = useState<CampaignOverview | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const userId = profile?.id ?? "";

  const registered = lookup.describe(
    profile?.lga_id,
    profile?.ward_id,
    profile?.polling_unit_id,
  );

  useEffect(() => {
    if (loading) return;
    if (!isAdmin && scopeLoading) return;

    let cancelled = false;

    async function load() {
      setDataLoading(true);

      try {
        const [myAssignments, myIssues] = await Promise.all([
          userId
            ? getAssignmentsForUser(userId)
            : Promise.resolve<CampaignAssignment[]>([]),
          userId
            ? getMyCampaignIssues(userId)
            : Promise.resolve<CampaignIssue[]>([]),
        ]);

        /* Admin reads across the whole state, resolved once. */
        const effective: CampaignScope | null = isAdmin
          ? await resolveCampaignScope("state", "enugu-state", lgas)
          : scope;

        if (!effective) {
          if (cancelled) return;

          setOverview({
            ...EMPTY_OVERVIEW,
            activities: [],
            issues: myIssues,
            openIssues: countOpenIssues(myIssues),
            myAssignments,
            myIssues,
          });
          return;
        }

        if (isAdmin) {
          const [members, assignments, activities, issues, reports] =
            await Promise.all([
              getCampaignMembersInScope(effective),
              getAssignmentsInScope(effective, lgas),
              getActivitiesInScope(effective, profile),
              getIssuesInScope(effective),
              getAllCampaignReports(),
            ]);

          if (cancelled) return;

          setOverview(buildOverview({
            memberCount: members.length,
            assignments,
            activities,
            issues,
            reports,
            pollingUnits: effective.pollingUnitIds.length,
            myAssignments,
            myIssues,
          }));
          return;
        }

        if (isCoordinator) {
          const [members, assignments, activities, issues, reports] =
            await Promise.all([
              getCampaignMembersInScope(effective),
              getAssignmentsInScope(effective, lgas),
              getActivitiesInScope(effective, profile),
              getIssuesInScope(effective),
              userId
                ? getReportsReceived(userId)
                : Promise.resolve<CampaignReport[]>([]),
            ]);

          if (cancelled) return;

          setOverview(buildOverview({
            memberCount: members.length,
            assignments,
            activities,
            issues,
            reports,
            pollingUnits: effective.pollingUnitIds.length,
            myAssignments,
            myIssues,
          }));
          return;
        }

        /* Plain member: own work plus the PU they registered in. */
        const [members, activities] = await Promise.all([
          getCampaignMembersInScope(effective),
          getActivitiesInScope(effective, profile),
        ]);

        if (cancelled) return;

        setOverview({
          ...EMPTY_OVERVIEW,
          members: members.length,
          pollingUnits: 1,
          openIssues: countOpenIssues(myIssues),
          activities,
          issues: myIssues,
          myAssignments,
          myIssues,
        });
      } catch (error) {
        console.error("Failed to load the campaign dashboard:", error);

        if (!cancelled) {
          notify.error("Unable to load your campaign summary right now.");
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    loading,
    isAdmin,
    isCoordinator,
    scope,
    scopeLoading,
    lgas,
    userId,
    profile,
  ]);

  if (!profile) return null;

  if (loading || dataLoading || !overview) {
    return <DashboardSkeleton />;
  }

  const positionLabel = formatOrganizationalPosition(authority.position);

  const myOpenAssignments = overview.myAssignments.filter(
    (item) => item.status === "open",
  ).length;

  const myClosedAssignments = overview.myAssignments.filter(
    (item) => item.status === "closed",
  ).length;

  const myOpenIssues = countOpenIssues(overview.myIssues);

  const recentActivities = [...overview.activities]
    .sort((a, b) => `${b.date}`.localeCompare(`${a.date}`))
    .slice(0, 5);

  const recentIssues = [...overview.issues]
    .sort((a, b) => String(b.raised_at ?? "").localeCompare(String(a.raised_at ?? "")))
    .slice(0, 5);

  return (
    <div className="space-y-6 pb-10">
      {/* ======================================================
          HEADER
          ====================================================== */}

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="bg-apc-primary px-6 py-7 text-white sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-white/80" />

                <span className="text-sm font-semibold text-white/80">
                  Campaign Council
                </span>
              </div>

              <h1 className="text-2xl font-bold sm:text-3xl">
                Welcome back, {profile.full_name || "Member"}
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
                {isCoordinator
                  ? "Your area of responsibility, and everything happening inside it."
                  : "Your polling unit, your assignments, and what is happening around you."}
              </p>
            </div>

            <div className="w-full rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm lg:w-auto lg:min-w-[280px]">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                {isCoordinator ? "Your position" : "Membership"}
              </p>

              <p className="mt-1 text-lg font-bold">
                {isCoordinator ? positionLabel : "Campaign Member"}
              </p>

              <div className="mt-2 flex items-center gap-2 text-sm text-white/75">
                <MapPin className="h-4 w-4 shrink-0" />

                <span className="truncate">
                  {isCoordinator ? scopeLabel : registered.wardLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <LocationStrip label="Registered LGA" value={registered.lgaLabel} />

          <LocationStrip label="Registered Ward" value={registered.wardLabel} />

          <LocationStrip
            label="Registered Polling Unit"
            value={registered.pollingUnitLabel}
          />
        </div>
      </section>

      {/* ======================================================
          AUTHORITY NOTES
          ====================================================== */}

      {!isCoordinator && !isAdmin && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex gap-3">
            <CircleAlert className="h-5 w-5 shrink-0 text-blue-700" />

            <div>
              <p className="font-semibold text-blue-900">
                You are viewing your polling unit
              </p>

              <p className="mt-1 text-sm leading-6 text-blue-800">
                Plain members see their own polling unit. When a coordinator
                position is assigned to you, this dashboard widens to that
                scope and everything below it.
              </p>
            </div>
          </div>
        </div>
      )}

      {isCoordinator && !scope && !scopeLoading && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
          <div className="flex gap-3">
            <CircleAlert className="h-5 w-5 shrink-0 text-yellow-600" />

            <div>
              <p className="font-semibold text-yellow-900">
                Your scope could not be resolved
              </p>

              <p className="mt-1 text-sm leading-6 text-yellow-800">
                The organizational assignment is active but the electoral
                hierarchy has no match for it. An administrator may need to
                correct the assignment&apos;s scope.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          SUMMARY
          ====================================================== */}

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-gray-900">
            {isCoordinator || isAdmin ? "Inside your scope" : "Your activity"}
          </h2>

          <p className="text-sm text-gray-500">
            {isCoordinator || isAdmin
              ? "Everything at your scope and below it."
              : "Your own work, and the polling unit you are registered in."}
          </p>
        </div>

        {isCoordinator || isAdmin ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              icon={<Users className="h-5 w-5" />}
              iconClass="bg-blue-100 text-blue-700"
              label="Members in scope"
              value={countLabel(overview.members, "No members yet")}
              detail={
                overview.members > 0
                  ? "Registered campaign members"
                  : "No members registered in this area yet"
              }
            />

            <StatTile
              icon={<Vote className="h-5 w-5" />}
              iconClass="bg-teal-100 text-teal-700"
              label="Polling units"
              value={countLabel(overview.pollingUnits, "None")}
              detail="Polling units covered by your scope"
            />

            <StatTile
              icon={<CheckSquare className="h-5 w-5" />}
              iconClass="bg-orange-100 text-orange-700"
              label="Open assignments"
              value={countLabel(overview.openAssignments, "None open")}
              detail="Campaign work still outstanding"
            />

            <StatTile
              icon={<FileText className="h-5 w-5" />}
              iconClass="bg-purple-100 text-purple-700"
              label="Reports received"
              value={countLabel(overview.pendingReports, "No reports received")}
              detail="Reports awaiting your review"
            />

            <StatTile
              icon={<Flag className="h-5 w-5" />}
              iconClass="bg-red-100 text-red-700"
              label="Open issues"
              value={countLabel(overview.openIssues, "No open issues")}
              detail="Issues raised inside your scope"
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={<CheckSquare className="h-5 w-5" />}
              iconClass="bg-orange-100 text-orange-700"
              label="My assignments"
              value={countLabel(myOpenAssignments, "No assignments yet")}
              detail={
                myClosedAssignments > 0
                  ? `${myClosedAssignments} completed`
                  : "Work assigned to you"
              }
            />

            <StatTile
              icon={<Users className="h-5 w-5" />}
              iconClass="bg-blue-100 text-blue-700"
              label="Members in my PU"
              value={countLabel(overview.members, "No members yet")}
              detail="Campaign members registered with you"
            />

            <StatTile
              icon={<Flag className="h-5 w-5" />}
              iconClass="bg-red-100 text-red-700"
              label="My open issues"
              value={countLabel(myOpenIssues, "No open issues")}
              detail="Issues you raised that are unresolved"
            />

            <StatTile
              icon={<CalendarDays className="h-5 w-5" />}
              iconClass="bg-green-100 text-green-700"
              label="Activities visible"
              value={countLabel(overview.activities.length, "None scheduled")}
              detail="Activities reaching your polling unit"
            />
          </div>
        )}
      </section>

      {/* ======================================================
          ACTIVITIES + ISSUES
          ====================================================== */}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b bg-gray-50/70">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Recent activities</CardTitle>

                <p className="mt-1 text-sm text-gray-500">
                  Meetings, rallies and outreach reaching you.
                </p>
              </div>

              <Link
                href="/portal/campaign/activities"
                className="inline-flex items-center gap-1 text-sm font-semibold text-apc-primary hover:underline"
              >
                All
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>

          <CardContent className="p-5">
            {recentActivities.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="h-5 w-5" />}
                title="No activities yet"
                description="Nothing has been scheduled at or above your scope."
              />
            ) : (
              <ul className="space-y-3">
                {recentActivities.map((activity) => (
                  <li
                    key={activity.id}
                    className="rounded-xl border p-4 transition hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">
                          {activity.title}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {formatActivityDate(activity.date)}
                          {activity.start_time ? ` · ${activity.start_time}` : ""}
                          {activity.venue ? ` · ${activity.venue}` : ""}
                        </p>
                      </div>

                      <span className="shrink-0 rounded-full bg-apc-primary/10 px-2.5 py-1 text-xs font-semibold text-apc-primary">
                        {describeScope(
                          activity.scope_type,
                          activity.scope_id,
                          lgas,
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b bg-gray-50/70">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">
                  {isCoordinator || isAdmin ? "Issues in scope" : "My issues"}
                </CardTitle>

                <p className="mt-1 text-sm text-gray-500">
                  {isCoordinator || isAdmin
                    ? "Raised at your scope or below it."
                    : "Issues you have raised."}
                </p>
              </div>

              <Link
                href="/portal/campaign/issues"
                className="inline-flex items-center gap-1 text-sm font-semibold text-apc-primary hover:underline"
              >
                All
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>

          <CardContent className="p-5">
            {recentIssues.length === 0 ? (
              <EmptyState
                icon={<Flag className="h-5 w-5" />}
                title="No issues reported yet"
                description="Nothing has been raised inside your scope."
              />
            ) : (
              <ul className="space-y-3">
                {recentIssues.map((issue) => (
                  <li
                    key={issue.id}
                    className="rounded-xl border p-4 transition hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">
                          {issue.title}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {describeScope(
                            issue.scope_level,
                            issue.scope_id,
                            lgas,
                          )}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          issue.status === "resolved"
                            ? "bg-green-100 text-green-700"
                            : issue.status === "acknowledged"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {issue.status === "resolved"
                          ? "Resolved"
                          : issue.status === "acknowledged"
                            ? "Acknowledged"
                            : "Open"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ======================================================
          SCOPE DETAIL
          ====================================================== */}

      {isCoordinator && scope && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your area of responsibility</CardTitle>

            <p className="text-sm text-gray-500">
              The organizational scope your position covers.
            </p>
          </CardHeader>

          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <DetailBox
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Position"
                value={positionLabel}
              />

              <DetailBox
                icon={<MapPin className="h-4 w-4" />}
                label="Scope"
                value={scope.label || scopeLabel}
              />

              <DetailBox
                icon={<Network className="h-4 w-4" />}
                label="Coverage"
                value={`${scope.lgaIds.length} LGA${
                  scope.lgaIds.length === 1 ? "" : "s"
                } · ${scope.wardIds.length} ward${
                  scope.wardIds.length === 1 ? "" : "s"
                }`}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ======================================================
          OPERATIONS
          ====================================================== */}

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-gray-900">Campaign operations</h2>

          <p className="text-sm text-gray-500">
            The tools available inside your scope.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <NavCard
            icon={<MapPin className="h-5 w-5 text-blue-600" />}
            iconBackground="bg-blue-100"
            title="My Area"
            description="Your scope, its numbers and its quick actions."
            href="/portal/campaign/area"
            action="View area"
          />

          {isCoordinator || isAdmin ? (
            <NavCard
              icon={<Users className="h-5 w-5 text-indigo-600" />}
              iconBackground="bg-indigo-100"
              title="Members"
              description="Members and coordinators inside your scope."
              href="/portal/campaign/members"
              action="View members"
            />
          ) : null}

          <NavCard
            icon={<CheckSquare className="h-5 w-5 text-orange-600" />}
            iconBackground="bg-orange-100"
            title="Assignments"
            description="Campaign work assigned to you or created by you."
            href="/portal/campaign/assignments"
            action="View assignments"
          />

          <NavCard
            icon={<CalendarDays className="h-5 w-5 text-green-600" />}
            iconBackground="bg-green-100"
            title="Activities"
            description="Meetings and events reaching your scope."
            href="/portal/campaign/activities"
            action="View activities"
          />

          <NavCard
            icon={<FileText className="h-5 w-5 text-purple-600" />}
            iconBackground="bg-purple-100"
            title="Reports"
            description="Submit reports, and review the ones you received."
            href="/portal/campaign/reports"
            action="View reports"
          />

          <NavCard
            icon={<Flag className="h-5 w-5 text-red-600" />}
            iconBackground="bg-red-100"
            title="Issues"
            description="Raise an issue, or respond to one in your area."
            href="/portal/campaign/issues"
            action="View issues"
          />

          {isAdmin && (
            <NavCard
              icon={<ShieldCheck className="h-5 w-5 text-slate-700" />}
              iconBackground="bg-slate-100"
              title="Coordination"
              description="Assign positions and manage permissions."
              href="/portal/campaign/coordination"
              action="Manage organization"
            />
          )}
        </div>
      </section>

      {/* ======================================================
          ELECTION OPERATIONS
          ====================================================== */}

      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-700" />

                <CardTitle className="text-lg">Election operations</CardTitle>
              </div>

              <p className="mt-1 text-sm text-gray-600">
                Election functions are separate from campaign organizational
                management.
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ElectionLink
              title="PU report"
              description="Report election activity at your polling unit."
            />

            <ElectionLink
              title="Incident"
              description="Raise an election incident."
            />

            <ElectionLink
              title="Results"
              description="Upload or review results where authorized."
            />

            <ElectionLink
              title="Election operations"
              description="Open the complete election area."
              primary
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================
 * OVERVIEW BUILDER
 * ============================================================ */

function buildOverview(input: {
  memberCount: number;
  assignments: CampaignAssignment[];
  activities: CampaignActivityRecord[];
  issues: CampaignIssue[];
  reports: CampaignReport[];
  pollingUnits: number;
  myAssignments: CampaignAssignment[];
  myIssues: CampaignIssue[];
}): CampaignOverview {
  return {
    members: input.memberCount,
    pollingUnits: input.pollingUnits,
    openAssignments: input.assignments.filter(
      (assignment) => assignment.status === "open",
    ).length,
    pendingReports: input.reports.filter(
      (report) => report.status === "submitted",
    ).length,
    openIssues: countOpenIssues(input.issues),
    activities: input.activities,
    issues: input.issues,
    myAssignments: input.myAssignments,
    myIssues: input.myIssues,
  };
}

/* ============================================================
 * SMALL COMPONENTS
 * ============================================================ */

function LocationStrip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-4">
      <MapPin className="h-4 w-4 shrink-0 text-apc-primary" />

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </p>

        <p className="mt-1 truncate text-sm font-semibold text-gray-900">
          {value}
        </p>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  iconClass,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {label}
            </p>

            <p className="mt-2 text-lg font-bold text-gray-900">{value}</p>

            <p className="mt-1 text-xs leading-5 text-gray-500">{detail}</p>
          </div>

          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailBox({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-gray-50 p-4">
      <div className="flex items-center gap-2">
        <span className="text-apc-primary">{icon}</span>

        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </p>
      </div>

      <p className="mt-2 font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function NavCard({
  icon,
  iconBackground,
  title,
  description,
  href,
  action,
}: {
  icon: ReactNode;
  iconBackground: string;
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex h-full flex-col p-5">
        <div
          className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${iconBackground}`}
        >
          {icon}
        </div>

        <h3 className="font-semibold text-gray-900">{title}</h3>

        <p className="mt-1 flex-1 text-sm leading-6 text-gray-500">
          {description}
        </p>

        <Link
          href={href}
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-apc-primary hover:underline"
        >
          {action}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

function ElectionLink({
  title,
  description,
  primary = false,
}: {
  title: string;
  description: string;
  primary?: boolean;
}) {
  return (
    <Link
      href="/portal/election"
      className={`rounded-xl border p-4 transition ${
        primary
          ? "border-apc-primary bg-apc-primary text-white shadow-sm hover:opacity-95"
          : "border-gray-200 bg-white hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={`font-semibold ${
              primary ? "text-white" : "text-gray-900"
            }`}
          >
            {title}
          </p>

          <p
            className={`mt-1 text-xs leading-5 ${
              primary ? "text-white/75" : "text-gray-500"
            }`}
          >
            {description}
          </p>
        </div>

        <ArrowRight
          className={`h-4 w-4 shrink-0 ${
            primary ? "text-white/80" : "text-gray-400"
          }`}
        />
      </div>
    </Link>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
        {icon}
      </div>

      <p className="mt-3 font-semibold text-gray-900">{title}</p>

      <p className="mx-auto mt-1 max-w-sm text-sm leading-5 text-gray-500">
        {description}
      </p>
    </div>
  );
}

/* ============================================================
 * SKELETON
 * ============================================================ */

function DashboardSkeleton() {
  return (
    <div className="space-y-6 pb-10">
      <div className="h-48 animate-pulse rounded-2xl bg-gray-100" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl bg-gray-100"
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />

        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your campaign summary…
      </div>
    </div>
  );
}
