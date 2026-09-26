"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  Flag,
  MapPin,
  ShieldCheck,
  Users,
  Vote,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useAuth } from "@/contexts/AuthContext";

import { getWardById, getPollingUnitById } from "@/lib/constants";

import {
  formatScopeType,
  getPrimaryOrganizationalScope,
} from "@/lib/organization";

import type {
  OrganizationalAssignment,
  OrganizationalPosition,
  ScopeType,
} from "@/types";

function useMyOrganizationalAssignments(_userId?: string): {
  assignments: OrganizationalAssignment[];
  loading: boolean;
  error: string | null;
} {
  return {
    assignments: [],
    loading: false,
    error: null,
  };
}

/*
 * ============================================================
 * CAMPAIGN AREA
 * ============================================================
 *
 * This page answers:
 *
 * "What part of the campaign organization am I responsible for?"
 *
 * IMPORTANT:
 *
 * Registered electoral location and organizational assignment
 * are deliberately kept separate.
 *
 * Example:
 *
 * A member may personally be registered in:
 *
 *   Ward 7 / PU 003
 *
 * while their campaign assignment may be:
 *
 *   LGA Coordinator / Nkanu West
 *
 * ============================================================
 */

export default function CampaignAreaPage() {
  const { profile } = useAuth();

  const { assignments, loading, error } = useMyOrganizationalAssignments(
    profile?.id,
  );

  if (!profile) {
    return null;
  }

  /*
   * ------------------------------------------------------------
   * PRIMARY ORGANIZATIONAL ASSIGNMENT
   * ------------------------------------------------------------
   */

  const primaryScope = getPrimaryOrganizationalScope(assignments);

  const hasAssignment = primaryScope.assignment !== null;

  /*
   * ------------------------------------------------------------
   * PERSONAL ELECTORAL LOCATION
   * ------------------------------------------------------------
   */

  const ward = getWardById(profile.ward_id);

  const pollingUnit = getPollingUnitById(
    profile.ward_id,
    profile.polling_unit_id,
  );

  const wardLabel = ward ? `${ward.code} — ${ward.name}` : "Not available";

  const pollingUnitLabel = pollingUnit
    ? `${pollingUnit.code} — ${pollingUnit.name}`
    : "Not available";

  /*
   * ------------------------------------------------------------
   * LOADING
   * ------------------------------------------------------------
   */

  if (loading) {
    return <CampaignAreaLoading />;
  }

  /*
   * ------------------------------------------------------------
   * ERROR
   * ------------------------------------------------------------
   */

  if (error) {
    return (
      <div className="space-y-6 pb-8">
        <BackLink />

        <Card className="border-red-200">
          <CardContent className="p-6">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                <ShieldCheck className="h-5 w-5 text-red-600" />
              </div>

              <div>
                <h2 className="font-semibold text-gray-900">
                  Unable to load your campaign area
                </h2>

                <p className="mt-1 text-sm text-gray-600">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /*
   * ------------------------------------------------------------
   * NO ASSIGNMENT
   * ------------------------------------------------------------
   */

  if (!hasAssignment) {
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
                <ShieldCheck className="h-5 w-5 text-yellow-700" />
              </div>

              <div>
                <h2 className="font-semibold text-yellow-900">
                  No organizational assignment yet
                </h2>

                <p className="mt-1 max-w-2xl text-sm leading-6 text-yellow-800">
                  Your account is registered as a campaign member, but you have
                  not yet been assigned a campaign organizational position.
                </p>

                <p className="mt-3 text-sm text-yellow-800">
                  Once an administrator assigns you to a campaign area, your
                  organizational scope will appear here.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <RegisteredArea
          wardLabel={wardLabel}
          pollingUnitLabel={pollingUnitLabel}
        />
      </div>
    );
  }

  /*
   * ------------------------------------------------------------
   * NORMAL AREA VIEW
   * ------------------------------------------------------------
   */

  const assignment = primaryScope.assignment!;

  return (
    <div className="space-y-6 pb-8">
      <BackLink />

      {/* ======================================================
          HEADER
          ====================================================== */}

      <PageHeader
        title="My Campaign Area"
        description="Your organizational responsibility within the campaign."
      />

      {/* ======================================================
          PRIMARY ASSIGNMENT
          ====================================================== */}

      <Card className="overflow-hidden border-apc-primary/20">
        <div className="bg-apc-primary px-6 py-5 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-white/70">
                Current Organizational Position
              </p>

              <h2 className="mt-1 text-2xl font-bold">
                {formatPosition(assignment.position)}
              </h2>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              Active Assignment
            </div>
          </div>
        </div>

        <CardContent className="p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <AreaInfo
              icon={<Building2 className="h-4 w-4" />}
              label="Organizational Scope"
              value={formatScopeType(assignment.scope_type)}
            />

            <AreaInfo
              icon={<MapPin className="h-4 w-4" />}
              label="Scope"
              value={assignment.scope_id}
            />

            <AreaInfo
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Assignment Status"
              value={formatAssignmentStatus(assignment.status)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ======================================================
          ORGANIZATIONAL HIERARCHY
          ====================================================== */}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Organizational Scope</CardTitle>

          <p className="text-sm text-gray-500">
            The level of the campaign organization you are currently assigned
            to.
          </p>
        </CardHeader>

        <CardContent>
          <OrganizationalHierarchy assignment={assignment} />
        </CardContent>
      </Card>

      {/* ======================================================
          AREA SUMMARY
          ====================================================== */}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Users className="h-5 w-5" />}
          title="Members"
          value="—"
          description="Members within your scope"
        />

        <SummaryCard
          icon={<Users className="h-5 w-5" />}
          title="Volunteers"
          value="—"
          description="Volunteers within your scope"
        />

        <SummaryCard
          icon={<Vote className="h-5 w-5" />}
          title="Polling Units"
          value="—"
          description="Polling units within your scope"
        />

        <SummaryCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Coordinators"
          value="—"
          description="Coordinators within your scope"
        />
      </div>

      {/* ======================================================
          AREA OPERATIONS
          ====================================================== */}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Area Operations</CardTitle>

          <p className="text-sm text-gray-500">
            Campaign functions available for your organizational scope.
          </p>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <AreaAction
              icon={<Users className="h-5 w-5" />}
              title="Members"
              description="View members belonging to your organizational area."
              href="/portal/campaign/members"
            />

            <AreaAction
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Assignments"
              description="Review campaign assignments associated with your area."
              href="/portal/campaign/assignments"
            />

            <AreaAction
              icon={<CalendarIcon />}
              title="Activities"
              description="View campaign activities taking place in your area."
              href="/portal/campaign/activities"
            />

            <AreaAction
              icon={<Flag className="h-5 w-5" />}
              title="Field Reports"
              description="Review or submit campaign field reports."
              href="/portal/campaign/reports"
            />
          </div>
        </CardContent>
      </Card>

      {/* ======================================================
          ASSIGNMENTS
          ====================================================== */}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            My Organizational Assignments
          </CardTitle>

          <p className="text-sm text-gray-500">
            All active campaign positions currently assigned to your account.
          </p>
        </CardHeader>

        <CardContent>
          <div className="space-y-3">
            {assignments.map((item) => (
              <AssignmentRow key={item.id} assignment={item} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ======================================================
          REGISTERED ELECTORAL LOCATION
          ====================================================== */}

      <RegisteredArea
        wardLabel={wardLabel}
        pollingUnitLabel={pollingUnitLabel}
      />

      {/* ======================================================
          ELECTION OPERATIONS
          ====================================================== */}

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-lg">Election Operations</CardTitle>

          <p className="text-sm text-gray-500">
            Election activity remains separate from your campaign organizational
            assignment.
          </p>
        </CardHeader>

        <CardContent>
          <Link
            href="/portal/election"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Election Operations
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

/*
 * ============================================================
 * PAGE HEADER
 * ============================================================
 */

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

/*
 * ============================================================
 * BACK LINK
 * ============================================================
 */

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

/*
 * ============================================================
 * AREA INFO
 * ============================================================
 */

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

/*
 * ============================================================
 * SUMMARY CARD
 * ============================================================
 */

function SummaryCard({
  icon,
  title,
  value,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-apc-primary/10 text-apc-primary">
            {icon}
          </div>

          <span className="text-2xl font-bold text-gray-900">{value}</span>
        </div>

        <p className="mt-4 font-semibold text-gray-900">{title}</p>

        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </CardContent>
    </Card>
  );
}

/*
 * ============================================================
 * AREA ACTION
 * ============================================================
 */

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

/*
 * ============================================================
 * ASSIGNMENT ROW
 * ============================================================
 */

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
          {formatPosition(assignment.position)}
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

/*
 * ============================================================
 * ORGANIZATIONAL HIERARCHY
 * ============================================================
 */

function OrganizationalHierarchy({
  assignment,
}: {
  assignment: OrganizationalAssignment;
}) {
  const levels = getHierarchyLevels(assignment);

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-center gap-2">
        {levels.map((level, index) => (
          <div
            key={`${level.type}-${level.id}`}
            className="flex items-center gap-2"
          >
            <div
              className={`rounded-xl border px-4 py-3 ${
                index === levels.length - 1
                  ? "border-apc-primary bg-apc-primary/5"
                  : "bg-white"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {formatScopeType(level.type)}
              </p>

              <p className="mt-1 font-semibold text-gray-900">{level.id}</p>
            </div>

            {index < levels.length - 1 && (
              <ChevronRight className="h-4 w-4 text-gray-300" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/*
 * ============================================================
 * REGISTERED ELECTORAL AREA
 * ============================================================
 */

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
        <CardTitle className="text-lg">My Registered Electoral Area</CardTitle>

        <p className="text-sm text-gray-500">
          Your personal electoral registration is separate from your campaign
          organizational responsibility.
        </p>
      </CardHeader>

      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <AreaInfo
            icon={<MapPin className="h-4 w-4" />}
            label="Registered Ward"
            value={wardLabel}
          />

          <AreaInfo
            icon={<MapPin className="h-4 w-4" />}
            label="Registered Polling Unit"
            value={pollingUnitLabel}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/*
 * ============================================================
 * LOADING
 * ============================================================
 */

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

/*
 * ============================================================
 * CALENDAR ICON
 * ============================================================
 */

function CalendarIcon() {
  return <Building2 className="h-5 w-5" />;
}

/*
 * ============================================================
 * POSITION FORMATTER
 * ============================================================
 */

function formatPosition(position: OrganizationalPosition): string {
  switch (position) {
    case "campaign_member":
      return "Campaign Member";

    case "ward_coordinator":
      return "Ward Coordinator";

    case "lga_coordinator":
      return "LGA Coordinator";

    case "zone_coordinator":
      return "Zone Coordinator";

    case "state_coordinator":
      return "State Coordinator";

    case "campaign_manager":
      return "Campaign Manager";

    case "council_chairman":
      return "Council Chairman";

    default:
      return position;
  }
}

/*
 * ============================================================
 * STATUS FORMATTER
 * ============================================================
 */

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

/*
 * ============================================================
 * HIERARCHY BUILDER
 * ============================================================
 *
 * At this stage we know the assigned scope IDs, but we do not
 * yet have a complete relational hierarchy service.
 *
 * Therefore we deliberately do NOT invent parent IDs.
 *
 * Later, when the organizational location data service is
 * connected, this function can resolve:
 *
 * State → Zone → LGA → Ward → PU
 *
 * without changing the dashboard architecture.
 * ============================================================
 */

function getHierarchyLevels(assignment: OrganizationalAssignment): Array<{
  type: ScopeType;
  id: string;
}> {
  return [
    {
      type: assignment.scope_type,
      id: assignment.scope_id,
    },
  ];
}

