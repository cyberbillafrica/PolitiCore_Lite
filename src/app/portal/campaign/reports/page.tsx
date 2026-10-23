"use client";

/*
 * ============================================================
 * CAMPAIGN REPORTS
 * ============================================================
 *
 * A report is a submission against an assignment.
 *
 * Visibility is deliberately NARROW and does not cascade up:
 *
 *   submitter .............. their own submissions
 *   assignment creator ..... every report against their work
 *   admin .................. everything, with a scope filter
 *
 * A coordinator who did not create the assignment sees nothing here.
 * That is the requirement, not a bug — reports are a private
 * conversation between the person who assigned the work and the
 * person who did it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ScopePicker from "@/components/campaign/ScopePicker";

import { useCampaignAuthority } from "@/hooks/useCampaignAuthority";
import { useElectoralLookup } from "@/hooks/useElectoralLookup";

import { notify } from "@/lib/notify";
import { resolveUserNames } from "@/lib/userNames";
import {
  describeScope,
  resolveCampaignScope,
  scopeCovers,
} from "@/lib/campaign-scope";

import {
  closeAssignmentIfComplete,
  getAssignmentsForUser,
  getAssignmentsInScope,
  markCompletionSubmitted,
  type CampaignAssignment,
} from "@/lib/firebase/campaignAssignments";

import {
  getAllCampaignReports,
  getMyCampaignReports,
  getReportsReceived,
  reviewCampaignReport,
  submitCampaignReport,
  type CampaignReport,
} from "@/lib/firebase/campaignReports";

import type { ScopeType } from "@/types";

/* ============================================================
 * HELPERS
 * ============================================================ */

function formatStatus(status: CampaignReport["status"]): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return "Submitted";
  }
}

function statusClasses(status: CampaignReport["status"]): string {
  switch (status) {
    case "approved":
      return "bg-green-100 text-green-700";
    case "rejected":
      return "bg-red-100 text-red-700";
    default:
      return "bg-blue-100 text-blue-700";
  }
}

function formatDate(value: unknown): string {
  if (!value) return "—";

  try {
    const date =
      typeof value === "object" && value !== null && "toDate" in value
        ? (value as { toDate: () => Date }).toDate()
        : new Date(String(value));

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function CampaignReportsPage() {
  const {
    profile,
    loading: authorityLoading,
    isAdmin,
    authority,
    scope,
  } = useCampaignAuthority();

  const { lgas } = useElectoralLookup();

  const uid = profile?.id ?? "";

  const [myReports, setMyReports] = useState<CampaignReport[]>([]);
  const [receivedReports, setReceivedReports] = useState<CampaignReport[]>([]);
  const [adminReports, setAdminReports] = useState<CampaignReport[]>([]);

  const [names, setNames] = useState<Map<string, string>>(new Map());

  const [assignments, setAssignments] = useState<CampaignAssignment[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formAssignmentId, setFormAssignmentId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");

  const [adminFilter, setAdminFilter] = useState<{
    level: ScopeType;
    scope_id: string;
  } | null>(null);

  /* ------------------------------------------------------------
   * LOAD
   * ------------------------------------------------------------ */

  const load = useCallback(async () => {
    if (!uid) {
      setMyReports([]);
      setReceivedReports([]);
      setAdminReports([]);
      setAssignments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [mine, received] = await Promise.all([
        getMyCampaignReports(uid),
        getReportsReceived(uid),
      ]);

      setMyReports(mine);
      setReceivedReports(received);

      /* Admin: universal read, optionally narrowed to one scope. */
      if (isAdmin) {
        let filter:
          | { level: ScopeType; wardIds: string[]; pollingUnitIds: string[] }
          | undefined;

        if (adminFilter) {
          const resolved = await resolveCampaignScope(
            adminFilter.level,
            adminFilter.scope_id,
            lgas,
          );

          if (resolved) {
            filter = {
              level: adminFilter.level,
              wardIds:
                adminFilter.level === "polling_unit" ? [] : resolved.wardIds,
              pollingUnitIds: resolved.pollingUnitIds,
            };
          }
        }

        setAdminReports(await getAllCampaignReports(filter));
      } else {
        setAdminReports([]);
      }

      /*
       * Assignments that target the caller — the only assignments a
       * report may be submitted against.
       */
      const [direct, inScope] = await Promise.all([
        getAssignmentsForUser(uid),
        scope
          ? getAssignmentsInScope(scope, lgas)
          : Promise.resolve<CampaignAssignment[]>([]),
      ]);

      const byId = new Map<string, CampaignAssignment>();
      for (const item of [...direct, ...inScope]) byId.set(item.id, item);

      const targeted = Array.from(byId.values()).filter((item) => {
        if (item.status !== "open") return false;
        if (item.assigned_to_user === uid) return true;

        if (!item.assigned_to_scope || !scope) return false;

        return scopeCovers(
          {
            level: item.assigned_to_scope.level,
            scopeId: item.assigned_to_scope.scope_id,
          },
          { level: scope.level, scopeId: scope.scope_id },
          lgas,
        );
      });

      setAssignments(targeted);

      /* Display names are resolved live, never denormalised. */
      const resolvedNames = await resolveUserNames([
        ...mine.map((report) => report.submitted_by),
        ...received.map((report) => report.submitted_by),
        ...received.map((report) => report.reviewed_by ?? null),
      ]);

      setNames(resolvedNames);
    } catch (error) {
      console.error("Failed to load campaign reports:", error);
      notify.error("Unable to load campaign reports.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid, isAdmin, adminFilter, scope, lgas]);

  useEffect(() => {
    if (authorityLoading) return;
    void load();
  }, [authorityLoading, load]);

  /* ------------------------------------------------------------
   * COUNTS
   * ------------------------------------------------------------ */

  const counts = useMemo(
    () => ({
      mine: myReports.length,
      submitted: myReports.filter((item) => item.status === "submitted").length,
      approved: myReports.filter((item) => item.status === "approved").length,
      rejected: myReports.filter((item) => item.status === "rejected").length,
      received: receivedReports.length,
    }),
    [myReports, receivedReports],
  );

  /* ------------------------------------------------------------
   * SUBMIT
   * ------------------------------------------------------------ */

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!uid) return;

    const level = authority.level;
    const scopedId = authority.scopeId;

    if (!level || !scopedId) {
      notify.error(
        "Your campaign location is not set, so a report cannot be scoped.",
      );
      return;
    }

    const assignment = assignments.find(
      (item) => item.id === formAssignmentId,
    );

    if (!assignment) {
      notify.error("Select the assignment this report is completing.");
      return;
    }

    if (!formTitle.trim() || !formContent.trim()) {
      notify.error("A report needs a title and its content.");
      return;
    }

    try {
      setSubmitting(true);

      const reportId = await submitCampaignReport({
        assignment_id: assignment.id,
        assignment_creator_id: assignment.created_by,
        submitted_by: uid,
        title: formTitle.trim(),
        content: formContent.trim(),
        scope_level: level,
        scope_id: scopedId,
        scope_snapshot: {
          level,
          scope_id: scopedId,
          lga_id: profile?.lga_id ?? null,
          ward_id: profile?.ward_id ?? null,
          polling_unit_id: profile?.polling_unit_id ?? null,
        },
      });

      if (assignment.completion_mode === "per_person") {
        await markCompletionSubmitted(assignment.id, uid, reportId);
      }

      notify.success("Report submitted for review.");

      setFormAssignmentId("");
      setFormTitle("");
      setFormContent("");
      setShowForm(false);

      await load();
    } catch (error) {
      console.error("Failed to submit campaign report:", error);
      notify.error("Unable to submit the report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ------------------------------------------------------------
   * REVIEW
   * ------------------------------------------------------------ */

  async function handleReview(
    report: CampaignReport,
    status: "approved" | "rejected",
    notes: string,
  ): Promise<void> {
    if (!uid) return;

    try {
      setBusyReportId(report.id);

      await reviewCampaignReport({
        reportId: report.id,
        status,
        reviewedBy: uid,
        notes,
      });

      if (status === "approved" && report.assignment_id) {
        await closeAssignmentIfComplete(report.assignment_id);
      }

      notify.success(
        status === "approved" ? "Report approved." : "Report rejected.",
      );

      await load();
    } catch (error) {
      console.error("Failed to review campaign report:", error);
      notify.error("Unable to review this report.");
    } finally {
      setBusyReportId(null);
    }
  }

  /* ------------------------------------------------------------
   * GUARDS
   * ------------------------------------------------------------ */

  if (!profile) return null;

  if (authorityLoading || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-apc-primary" />
        <p className="text-sm text-gray-500">Loading campaign reports…</p>
      </div>
    );
  }

  const canSubmit = assignments.length > 0;

  /* ------------------------------------------------------------
   * RENDER
   * ------------------------------------------------------------ */

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/portal/dashboard"
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-apc-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Campaign Dashboard
          </Link>

          <p className="text-sm font-semibold text-apc-primary">
            Campaign Operations
          </p>

          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
            Reports
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Reports are completed against an assignment. Only you and the person
            who created that assignment can read what you submit.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void load();
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>

          {canSubmit && (
            <button
              type="button"
              onClick={() => setShowForm((value) => !value)}
              className="inline-flex items-center gap-2 rounded-lg bg-apc-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-apc-dark"
            >
              <Send className="h-4 w-4" />
              Submit Report
            </button>
          )}
        </div>
      </div>

      {/* SCOPE */}

      <Card className="border-apc-primary/10">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-apc-primary/10 text-apc-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Reporting as
              </p>

              <p className="mt-1 font-semibold text-gray-900">
                {profile.full_name || "Member"}
              </p>

              <p className="mt-1 text-sm text-gray-500">
                {authority.level
                  ? describeScope(authority.level, authority.scopeId, lgas)
                  : "No campaign location set"}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-gray-50 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Assignments awaiting your report
            </p>

            <p className="mt-1 text-2xl font-bold text-gray-900">
              {assignments.length}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* SUMMARY */}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My reports" value={counts.mine} />

        <StatCard label="Submitted" value={counts.submitted} />

        <StatCard label="Approved" value={counts.approved} positive />

        <StatCard label="Reports received" value={counts.received} />
      </div>

      {/* ADMIN FILTER */}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filter by scope</CardTitle>

            <p className="text-sm text-gray-500">
              Narrow the statewide list to a zone, LGA, ward or polling unit.
            </p>
          </CardHeader>

          <CardContent className="max-w-md">
            <ScopePicker
              idPrefix="reports-filter"
              label="Scope"
              value={adminFilter}
              onChange={setAdminFilter}
              allowAll
              allLabel="All reports"
              hint="Reports are filtered by the reporter's location at submission time."
            />
          </CardContent>
        </Card>
      )}

      {/* FORM */}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Submit a report</CardTitle>

            <p className="text-sm text-gray-500">
              Choose the assignment this report completes. The assignment creator
              is the only other person who will see it.
            </p>
          </CardHeader>

          <CardContent>
            {assignments.length === 0 ? (
              <EmptyBlock
                title="No assignments to report against yet"
                description="A report is submitted against an assignment. When someone assigns work to you or your area, it will appear here."
              />
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="report-assignment"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    Assignment
                  </label>

                  <select
                    id="report-assignment"
                    required
                    value={formAssignmentId}
                    onChange={(event) =>
                      setFormAssignmentId(event.target.value)
                    }
                    className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:border-apc-primary"
                  >
                    <option value="">Select an assignment…</option>

                    {assignments.map((assignment) => (
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="report-title"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    Title
                  </label>

                  <input
                    id="report-title"
                    required
                    value={formTitle}
                    onChange={(event) => setFormTitle(event.target.value)}
                    placeholder="e.g. Ward meeting report"
                    className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:border-apc-primary"
                  />
                </div>

                <div>
                  <label
                    htmlFor="report-content"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    What was done?
                  </label>

                  <textarea
                    id="report-content"
                    required
                    rows={5}
                    value={formContent}
                    onChange={(event) => setFormContent(event.target.value)}
                    placeholder="Describe the work completed against this assignment."
                    className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:border-apc-primary"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    disabled={submitting}
                    className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-apc-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-apc-dark disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Submit report
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* MY SUBMISSIONS */}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">My submissions</CardTitle>

          <p className="text-sm text-gray-500">
            Reports you have submitted, and the creator&apos;s decision.
          </p>
        </CardHeader>

        <CardContent>
          {myReports.length === 0 ? (
            <EmptyBlock
              title="No reports yet"
              description="Once you submit a report against an assignment it will appear here with its review status."
            />
          ) : (
            <div className="space-y-3">
              {myReports.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  submitter={names.get(report.submitted_by) ?? "You"}
                  scopeText={describeScope(
                    report.scope_level,
                    report.scope_id,
                    lgas,
                  )}
                  canReview={false}
                  busy={false}
                  onReview={handleReview}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* REPORTS RECEIVED */}

      {receivedReports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reports received</CardTitle>

            <p className="text-sm text-gray-500">
              Submissions against assignments you created.
            </p>
          </CardHeader>

          <CardContent>
            <div className="space-y-3">
              {receivedReports.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  submitter={names.get(report.submitted_by) ?? "Unknown member"}
                  scopeText={describeScope(
                    report.scope_level,
                    report.scope_id,
                    lgas,
                  )}
                  canReview
                  busy={busyReportId === report.id}
                  onReview={handleReview}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ADMIN — ALL REPORTS */}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All reports</CardTitle>

            <p className="text-sm text-gray-500">
              Universal read. {adminFilter ? "Filtered to the selected scope." : "Showing every report in the state."}
            </p>
          </CardHeader>

          <CardContent>
            {adminReports.length === 0 ? (
              <EmptyBlock
                title="No reports yet"
                description="No campaign reports have been submitted for this view."
              />
            ) : (
              <div className="space-y-3">
                {adminReports.map((report) => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    submitter={
                      names.get(report.submitted_by) ?? "Unknown member"
                    }
                    scopeText={describeScope(
                      report.scope_level,
                      report.scope_id,
                      lgas,
                    )}
                    canReview
                    busy={busyReportId === report.id}
                    onReview={handleReview}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ============================================================
 * REPORT ROW
 * ============================================================ */

function ReportRow({
  report,
  submitter,
  scopeText,
  canReview,
  busy,
  onReview,
}: {
  report: CampaignReport;
  submitter: string;
  scopeText: string;
  canReview: boolean;
  busy: boolean;
  onReview: (
    report: CampaignReport,
    status: "approved" | "rejected",
    notes: string,
  ) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const reviewable = canReview && report.status === "submitted";

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900">{report.title}</p>

            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(
                report.status,
              )}`}
            >
              {formatStatus(report.status)}
            </span>
          </div>

          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-600">
            {report.content}
          </p>

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
            <span>{submitter}</span>
            <span>{formatDate(report.submitted_at)}</span>
            <span>{scopeText}</span>
            {report.reviewed_at ? (
              <span>Reviewed {formatDate(report.reviewed_at)}</span>
            ) : null}
          </div>

          {report.review_notes && (
            <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <span className="font-semibold">Review notes: </span>
              {report.review_notes}
            </p>
          )}
        </div>

        {reviewable && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            {open ? "Close" : "Review"}
          </button>
        )}
      </div>

      {reviewable && open && (
        <div className="mt-4 space-y-3 rounded-xl border bg-gray-50 p-4">
          <div>
            <label
              htmlFor={`notes-${report.id}`}
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Review notes (optional)
            </label>

            <textarea
              id={`notes-${report.id}`}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Explain the decision for the submitter."
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-apc-primary"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onReview(report, "approved", notes)}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Approve
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void onReview(report, "rejected", notes)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * SMALL COMPONENTS
 * ============================================================ */

function StatCard({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: number;
  positive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </p>

        <p
          className={`mt-2 text-2xl font-bold ${
            positive ? "text-green-700" : "text-gray-900"
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function EmptyBlock({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <FileText className="mx-auto h-8 w-8 text-gray-300" />

      <p className="mt-3 font-semibold text-gray-900">{title}</p>

      <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-gray-500">
        {description}
      </p>
    </div>
  );
}
