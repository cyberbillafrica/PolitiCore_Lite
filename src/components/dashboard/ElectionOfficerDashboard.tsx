"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileText,
  MapPin,
  Upload,
  ShieldCheck,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveContest } from "@/hooks/useElectionEngine";
import { useElectoralLookup } from "@/hooks/useElectoralLookup";
import {
  describeContestScope,
  lgasWithinContestScope,
} from "@/lib/election-scope";
import {
  subscribeToElectionResults,
  subscribeToElectionIncidents,
  subscribeToPUReports,
} from "@/lib/firebase/election";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type ActionCardProps = {
  icon: React.ReactNode;
  iconBackground: string;
  title: string;
  description: string;
  href: string;
  action: string;
  disabled?: boolean;
};

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  description: string;
};

/* -------------------------------------------------------------------------- */
/* Main Dashboard                                                             */
/* -------------------------------------------------------------------------- */

export default function ElectionOfficerDashboard() {
  const { profile } = useAuth();
  const { contest: activeContest } = useActiveContest();
  const lookup = useElectoralLookup();

  /*
   * Live activity counters. Officers are unconditional readers in
   * the rules (isElectionOfficer()), but every query here is still
   * an equality-filtered, provable read — no collection-wide fetch.
   */
  const [puReportCount, setPuReportCount] = useState(0);
  const [incidentCount, setIncidentCount] = useState(0);
  const [resultCount, setResultCount] = useState(0);
  const [approvedPuCount, setApprovedPuCount] = useState(0);

  const officerId = profile?.id ?? "";

  useEffect(() => {
    if (!officerId) return;

    const unsubscribe = subscribeToPUReports(
      (docs) => setPuReportCount(docs.length),
      (err) => console.error("Officer PU report count failed:", err),
      { submitted_by: officerId },
    );

    return () => unsubscribe();
  }, [officerId]);

  useEffect(() => {
    if (!officerId) return;

    const unsubscribe = subscribeToElectionIncidents(
      (docs) => setIncidentCount(docs.length),
      (err) => console.error("Officer incident count failed:", err),
      { reported_by: officerId },
    );

    return () => unsubscribe();
  }, [officerId]);

  useEffect(() => {
    if (!officerId) return;

    // Submitted OR reviewed by this officer — one listener per
    // provable query, merged by document id.
    const unsubscribe = subscribeToElectionResults(
      (docs) => setResultCount(docs.length),
      (err) => console.error("Officer result count failed:", err),
      { submitted_by: officerId },
      [{ reviewed_by: officerId }],
    );

    return () => unsubscribe();
  }, [officerId]);

  const activeContestId = activeContest?.id ?? "";

  useEffect(() => {
    if (!activeContestId) {
      setApprovedPuCount(0);
      return;
    }

    const unsubscribe = subscribeToElectionResults(
      (docs) => {
        const approved = docs.filter((doc) => doc.status === "approved");
        const distinct = new Set(approved.map((doc) => doc.polling_unit_id));
        setApprovedPuCount(distinct.size);
      },
      (err) => console.error("Officer coverage count failed:", err),
      { contest_id: activeContestId },
    );

    return () => unsubscribe();
  }, [activeContestId]);

  /*
   * Contest scope is the single source of truth for the operational
   * geography: officers act inside the active contest's scope —
   * never "all wards and polling units" of the state.
   */
  const scopedLgas = useMemo(
    () => lgasWithinContestScope(activeContest, lookup.lgas),
    [activeContest, lookup.lgas],
  );

  const scopePuCount = useMemo(
    () =>
      scopedLgas.reduce(
        (acc, lga) =>
          acc + lga.wards.reduce((wAcc, ward) => wAcc + ward.pollingUnits.length, 0),
        0,
      ),
    [scopedLgas],
  );

  const scopeWardCount = useMemo(
    () => scopedLgas.reduce((acc, lga) => acc + lga.wards.length, 0),
    [scopedLgas],
  );

  const scopeLabel = describeContestScope(activeContest, lookup.lgas);
  const hasActiveContest = Boolean(activeContest);

  const coveragePercent =
    hasActiveContest && scopePuCount > 0
      ? `${((approvedPuCount / scopePuCount) * 100).toFixed(1)}%`
      : "N/A";

  if (!profile) return null;

  /*
   * The officer's registered electoral area is shown for identity
   * only; operational actions point at the contest-scoped routes.
   */
  const registered = lookup.describe(
    profile.lga_id,
    profile.ward_id,
    profile.polling_unit_id,
  );

  return (
    <div className="space-y-6 pb-10">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}

      <section className="rounded-2xl bg-gradient-to-r from-apc-primary to-apc-dark p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
              <ShieldCheck className="h-4 w-4" />
              Election Operations
            </div>

            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome back, {profile.full_name || "Election Officer"}
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
              Monitor election activities, submit polling-unit reports, report
              incidents, and upload election results across every polling unit
              within the active contest&apos;s scope.
            </p>
          </div>

          <div className="shrink-0 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15">
                <MapPin className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/60">
                  Operational Scope
                </p>
                <p className="mt-0.5 font-semibold">
                  {hasActiveContest
                    ? "All polling units within the active contest's scope"
                    : "No active contest"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Active contest scope banner                                         */}
      {/* ------------------------------------------------------------------ */}

      {hasActiveContest ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-apc-primary/20 bg-apc-light/50 p-3 text-xs">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-apc-primary" />
          <span className="font-semibold text-apc-primary">Active contest:</span>
          <span className="font-bold text-gray-900">{activeContest?.name}</span>
          <span className="text-gray-500">· Scope: {scopeLabel}</span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>No active contest — election operations are unavailable.</strong>{" "}
            An administrator must activate a contest in the Election Control
            Center before reports, incidents or results can be submitted.
          </span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Operational stats                                                  */}
      {/* ------------------------------------------------------------------ */}

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Election Operations
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Your election activity overview.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<ClipboardList className="h-5 w-5" />}
            label="PU Reports"
            value={puReportCount}
            description="Reports submitted by you"
          />

          <StatCard
            icon={<AlertTriangle className="h-5 w-5" />}
            label="Incidents"
            value={incidentCount}
            description="Incidents reported by you"
          />

          <StatCard
            icon={<Upload className="h-5 w-5" />}
            label="Results"
            value={resultCount}
            description="Results submitted or reviewed by you"
          />

          <StatCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Coverage"
            value={coveragePercent}
            description={
              hasActiveContest
                ? `${approvedPuCount} of ${scopePuCount} PUs approved in scope`
                : "No active contest"
            }
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Quick actions                                                       */}
      {/* ------------------------------------------------------------------ */}

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Quick Operations
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            {hasActiveContest
              ? "Start an election activity report from here."
              : "Unavailable until a contest is active."}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ActionCard
            icon={<ClipboardList className="h-6 w-6 text-blue-600" />}
            iconBackground="bg-blue-100"
            title="PU Report"
            description="Submit an operational report for any polling unit in scope."
            href="/portal/election/pu-reports"
            action="Submit PU Report"
            disabled={!hasActiveContest}
          />

          <ActionCard
            icon={<AlertTriangle className="h-6 w-6 text-orange-600" />}
            iconBackground="bg-orange-100"
            title="Report Incident"
            description="Record an election incident and associate it with a polling unit."
            href="/portal/election/incidents"
            action="Report Incident"
            disabled={!hasActiveContest}
          />

          <ActionCard
            icon={<Upload className="h-6 w-6 text-green-600" />}
            iconBackground="bg-green-100"
            title="Result Upload"
            description="Submit polling-unit election results for the official record."
            href="/portal/election/upload"
            action="Upload Result"
            disabled={!hasActiveContest}
          />

          <ActionCard
            icon={<CheckCircle2 className="h-6 w-6 text-purple-600" />}
            iconBackground="bg-purple-100"
            title="Review Submissions"
            description="Approve, reject, or clarify submitted polling-unit results before they appear on the central dashboard."
            href="/portal/election/operations"
            action="Open Review Queue"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Coverage / operational scope                                        */}
      {/* ------------------------------------------------------------------ */}

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Electoral Coverage</CardTitle>

                <p className="mt-1 text-sm text-gray-500">
                  Election officers can report across all polling units within
                  the active contest&apos;s scope.
                </p>
              </div>

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100">
                <MapPin className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500">Operational scope</p>

                  <p className="mt-1 font-semibold text-gray-900">
                    {hasActiveContest ? scopeLabel : "No active contest"}
                  </p>
                </div>

                <div
                  className={
                    hasActiveContest
                      ? "rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"
                      : "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
                  }
                >
                  {hasActiveContest ? "Contest-Scoped" : "Unavailable"}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Wards in scope
                  </p>

                  <p className="mt-1 text-lg font-bold text-gray-900">
                    {hasActiveContest ? scopeWardCount.toLocaleString() : "0"}
                  </p>
                </div>

                <div className="rounded-lg bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Polling Units in scope
                  </p>

                  <p className="mt-1 text-lg font-bold text-gray-900">
                    {hasActiveContest ? scopePuCount.toLocaleString() : "0"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Officer profile area                                              */}
        {/* ---------------------------------------------------------------- */}

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Officer Information</CardTitle>

                <p className="mt-1 text-sm text-gray-500">
                  Your registered electoral information.
                </p>
              </div>

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="space-y-3">
              <InfoRow
                label="Name"
                value={profile.full_name || "Not provided"}
              />

              <InfoRow label="Registered LGA" value={registered.lgaLabel} />

              <InfoRow label="Registered Ward" value={registered.wardLabel} />

              <InfoRow
                label="Registered Polling Unit"
                value={registered.pollingUnitLabel}
              />

              <InfoRow
                label="Operational Access"
                value={
                  hasActiveContest
                    ? `All polling units within ${scopeLabel}`
                    : "No active contest"
                }
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Monitoring section                                                  */}
      {/* ------------------------------------------------------------------ */}

      <Card className="overflow-hidden border-0 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">
                Election Activity Monitoring
              </CardTitle>

              <p className="mt-1 text-sm text-gray-500">
                Use the operational modules to submit and monitor election
                activity.
              </p>
            </div>

            <BarChart3 className="hidden h-5 w-5 text-gray-400 sm:block" />
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <MonitoringLink
              href="/portal/election/pu-reports"
              icon={<FileText className="h-5 w-5" />}
              title="Polling Unit Reports"
              description="View and submit PU reports."
            />

            <MonitoringLink
              href="/portal/election/incidents"
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Incident Reports"
              description="Record and review election incidents."
            />

            <MonitoringLink
              href="/portal/election/upload"
              icon={<Upload className="h-5 w-5" />}
              title="Result Uploads"
              description="Submit election results by polling unit."
            />
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Operational reminder                                                */}
      {/* ------------------------------------------------------------------ */}

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
        <div className="flex gap-3">
          <div className="mt-0.5 shrink-0">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
          </div>

          <div>
            <h3 className="font-semibold text-blue-900">
              Election Officer Access
            </h3>

            <p className="mt-1 text-sm leading-6 text-blue-800/80">
              As an Election Officer, you can submit election activity reports
              for any polling unit within the active contest&apos;s scope.
              Ordinary members remain restricted to their registered electoral
              area.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat Card                                                                  */
/* -------------------------------------------------------------------------- */

function StatCard({ icon, label, value, description }: StatCardProps) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">{label}</p>

            <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>

            <p className="mt-1 text-xs text-gray-400">{description}</p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Action Card                                                                */
/* -------------------------------------------------------------------------- */

function ActionCard({
  icon,
  iconBackground,
  title,
  description,
  href,
  action,
  disabled = false,
}: ActionCardProps) {
  return (
    <Card
      className={`border-0 shadow-sm transition-shadow ${
        disabled ? "opacity-60" : "hover:shadow-md"
      }`}
    >
      <CardContent className="p-5">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconBackground}`}
        >
          {icon}
        </div>

        <h3 className="mt-4 font-semibold text-gray-900">{title}</h3>

        <p className="mt-1 min-h-[48px] text-sm leading-5 text-gray-500">
          {description}
        </p>

        {disabled ? (
          <span
            title="No active contest — election operations are unavailable"
            className="mt-5 inline-flex cursor-not-allowed items-center gap-1.5 text-sm font-semibold text-gray-400"
          >
            {action}
            <ArrowRight className="h-4 w-4" />
          </span>
        ) : (
          <Link
            href={href}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-apc-primary hover:underline"
          >
            {action}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Monitoring Link                                                            */
/* -------------------------------------------------------------------------- */

function MonitoringLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 transition hover:border-apc-primary/20 hover:bg-white hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-gray-600 shadow-sm transition group-hover:text-apc-primary">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-900">{title}</p>

        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>

      <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-apc-primary" />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Info Row                                                                   */
/* -------------------------------------------------------------------------- */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-gray-500">{label}</span>

      <span className="text-sm font-semibold text-gray-900 sm:text-right">
        {value}
      </span>
    </div>
  );
}
