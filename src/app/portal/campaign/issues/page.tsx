"use client";

/*
 * ============================================================
 * CAMPAIGN ISSUES
 * ============================================================
 *
 * Any member may raise an issue. Issues cascade UP: the raiser sees
 * their own, every coordinator whose scope covers the issue sees it,
 * and admin sees everything.
 *
 * The viewer with the smallest covering scope is the natural
 * responder, but any coordinator at or above the issue may
 * acknowledge or resolve it (admin included).
 */

import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import ScopePicker, {
  type ScopeValue,
} from "@/components/campaign/ScopePicker";

import { useCampaignAuthority } from "@/hooks/useCampaignAuthority";
import { useElectoralLookup } from "@/hooks/useElectoralLookup";

import {
  describeScope,
  resolveCampaignScope,
  type CampaignScope,
} from "@/lib/campaign-scope";
import { adminScopeGrants } from "@/lib/campaign-read-scope";
import {
  scopeContainsTarget,
  scopeIdsByLevel,
  scopeLevels,
  stateWideScope,
  writableScopes,
} from "@/lib/campaign-scope-options";

import {
  acknowledgeCampaignIssue,
  getIssuesInScope,
  getMyCampaignIssues,
  raiseCampaignIssue,
  resolveCampaignIssue,
} from "@/lib/firebase/campaignIssues";

import { notify } from "@/lib/notify";
import { resolveUserNames } from "@/lib/userNames";

import type { CampaignIssue, ScopeType } from "@/types";

/* ============================================================
 * HELPERS
 * ============================================================ */

function mergeIssues(
  left: CampaignIssue[],
  right: CampaignIssue[],
): CampaignIssue[] {
  const byId = new Map<string, CampaignIssue>();
  for (const item of [...left, ...right]) byId.set(item.id, item);
  return Array.from(byId.values()).sort((a, b) => {
    const leftAt = a.raised_at ? String(a.raised_at) : "";
    const rightAt = b.raised_at ? String(b.raised_at) : "";
    return rightAt.localeCompare(leftAt);
  });
}

const STATUS_LABELS: Record<CampaignIssue["status"], string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};

const STATUS_CLASSES: Record<CampaignIssue["status"], string> = {
  open: "bg-amber-100 text-amber-800",
  acknowledged: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
};

/* ============================================================
 * PAGE
 * ============================================================ */

export default function CampaignIssuesPage() {
  const {
    profile,
    authority,
    scope,
    scopeLabel,
    loading,
    isAdmin,
    isCoordinator,
    grants,
  } = useCampaignAuthority();

  const lookup = useElectoralLookup();

  const [issues, setIssues] = useState<CampaignIssue[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [scopeFilter, setScopeFilter] = useState<ScopeValue | null>(null);
  const [filterScope, setFilterScope] = useState<CampaignScope | null>(null);

  const [busyIssueId, setBusyIssueId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const userId = profile?.id ?? "";

  /* ------------------------------------------------------------
   * SCOPE FILTER → RESOLVED SCOPE
   * ------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;

    if (!scopeFilter) {
      setFilterScope(null);
      return;
    }

    resolveCampaignScope(
      scopeFilter.level,
      scopeFilter.scope_id,
      lookup.lgas,
    ).then((resolved) => {
      if (!cancelled) setFilterScope(resolved);
    });

    return () => {
      cancelled = true;
    };
  }, [scopeFilter, lookup.lgas]);

  /*
   * R8 — the filter is offered to every coordinator, not just an admin,
   * and never to a plain member. Its options are the scopes where the
   * caller holds `manage_issue` — the same grants the `issues` read
   * clauses consult.
   */
  const canFilter = isAdmin || isCoordinator;

  const filterOptions = useMemo(
    () =>
      isAdmin ? [] : writableScopes(grants, "manage_issue", lookup.lgas),
    [grants, isAdmin, lookup.lgas],
  );

  const filterLevels = useMemo(
    () => (isAdmin ? undefined : scopeLevels(filterOptions)),
    [filterOptions, isAdmin],
  );

  const filterScopeIds = useMemo(
    () => (isAdmin ? undefined : scopeIdsByLevel(filterOptions)),
    [filterOptions, isAdmin],
  );

  /* "All" for an admin means the whole state. */
  const allScope = useMemo(() => stateWideScope(lookup.lgas), [lookup.lgas]);

  /* ------------------------------------------------------------
   * LOAD
   * ------------------------------------------------------------ */

  const load = useCallback(async () => {
    if (!userId) {
      setIssues([]);
      setDataLoading(false);
      return;
    }

    try {
      const mine = await getMyCampaignIssues(userId);

      /*
       * R8 — the page loads EVERYTHING the viewer may see once, then
       * narrows in memory when a scope is picked. An admin's default is
       * therefore the whole state instead of "nothing until a scope is
       * chosen": `getIssuesInScope()` returns nothing for a null scope.
       */
      const scoped = canFilter
        ? await getIssuesInScope(
            isAdmin ? allScope : scope,
            /*
             * `isAdmin()` proves every scope pair, so an admin's read
             * plan is global rather than a `user_access` grant list
             * (which an admin may not have).
             */
            isAdmin ? adminScopeGrants(null, ["manage_issue"]) : grants,
          )
        : [];

      const merged = mergeIssues(mine, scoped);

      setIssues(merged);

      const resolved = await resolveUserNames(
        merged.flatMap((issue) => [
          issue.raised_by,
          issue.acknowledged_by ?? "",
          issue.resolved_by ?? "",
        ]),
      );

      setNames(resolved);
    } catch (error) {
      console.error("Failed to load campaign issues:", error);
      notify.error("Unable to load issues for your area.");
      setIssues([]);
    } finally {
      setDataLoading(false);
      setRefreshing(false);
    }
  }, [allScope, canFilter, grants, isAdmin, scope, userId]);

  useEffect(() => {
    if (loading) return;
    void load();
  }, [load, loading]);

  /* ------------------------------------------------------------
   * COUNTS
   * ------------------------------------------------------------ */

  /*
   * R8 — the picked scope narrows the already-loaded list: an issue is
   * in view when it was raised at the selected scope or anywhere below
   * it. Counts and the list both use this set.
   */
  const visibleIssues = useMemo(
    () =>
      issues.filter((issue) =>
        scopeContainsTarget(filterScope, issue.scope_level, issue.scope_id),
      ),
    [filterScope, issues],
  );

  const counts = useMemo(
    () => ({
      open: visibleIssues.filter((issue) => issue.status === "open").length,
      acknowledged: visibleIssues.filter(
        (issue) => issue.status === "acknowledged",
      ).length,
      resolved: visibleIssues.filter((issue) => issue.status === "resolved")
        .length,
    }),
    [visibleIssues],
  );

  /* ------------------------------------------------------------
   * ACTIONS
   * ------------------------------------------------------------ */

  async function handleAcknowledge(issue: CampaignIssue) {
    if (!userId) return;

    try {
      setBusyIssueId(issue.id);
      await acknowledgeCampaignIssue(issue.id, userId);
      notify.success("Issue acknowledged.");
      await load();
    } catch (error) {
      console.error("Failed to acknowledge issue:", error);
      notify.error("Unable to acknowledge this issue.");
    } finally {
      setBusyIssueId(null);
    }
  }

  async function handleResolve(issue: CampaignIssue) {
    if (!userId) return;

    try {
      setBusyIssueId(issue.id);
      await resolveCampaignIssue({
        issueId: issue.id,
        userId,
        notes: resolutionNotes,
      });
      notify.success("Issue resolved.");
      setResolvingId(null);
      setResolutionNotes("");
      await load();
    } catch (error) {
      console.error("Failed to resolve issue:", error);
      notify.error("Unable to resolve this issue.");
    } finally {
      setBusyIssueId(null);
    }
  }

  /* ------------------------------------------------------------
   * GUARDS
   * ------------------------------------------------------------ */

  if (!profile) return null;

  if (loading || (dataLoading && issues.length === 0)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-apc-primary" />
        <p className="text-sm text-gray-500">Loading issues…</p>
      </div>
    );
  }

  /*
   * Local constants so the narrowed level/id survive into the async
   * submit closure (property access narrowing does not).
   */
  const raiseLevel: ScopeType | null = authority.level;
  const raiseScopeId: string | null = authority.scopeId;

  const canRaise = Boolean(raiseLevel && raiseScopeId);

  return (
    <div className="space-y-6 pb-10">
      <Link
        href="/portal/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-apc-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Campaign Dashboard
      </Link>

      {/* HEADER */}

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-apc-primary">
              Campaign Operations
            </p>

            <h1 className="mt-1 text-2xl font-bold text-gray-900">Issues</h1>

            <p className="mt-2 max-w-2xl text-sm text-gray-500">
              Raise an issue from your area. It is visible to you, to the
              coordinators above you, and to the campaign admin.
            </p>
          </div>

          <div className="rounded-xl bg-apc-primary/5 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {isAdmin ? "Viewing" : "Your area"}
            </p>

            <p className="mt-1 font-semibold text-gray-900">
              {isAdmin
                ? scopeFilter
                  ? describeScope(
                      scopeFilter.level,
                      scopeFilter.scope_id,
                      lookup.lgas,
                    )
                  : "Enugu State"
                : filterScope
                  ? describeScope(
                      filterScope.level,
                      filterScope.scope_id,
                      lookup.lgas,
                    )
                  : scopeLabel}
            </p>
          </div>
        </div>
      </section>

      {/* SCOPE FILTER — admin: every scope; coordinators: their own */}

      {canFilter && (
        <Card>
          <CardContent className="p-5">
            <ScopePicker
              idPrefix="issues-filter"
              label="Filter issues by scope"
              allowAll
              allLabel="All scopes"
              value={scopeFilter}
              onChange={setScopeFilter}
              levels={filterLevels}
              scopeIds={filterScopeIds}
              hint="Shows issues raised at the selected scope and everything below it."
            />
          </CardContent>
        </Card>
      )}

      {/* SUMMARY */}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open" value={counts.open} tone="amber" />
        <StatCard
          label="Acknowledged"
          value={counts.acknowledged}
          tone="blue"
        />
        <StatCard label="Resolved" value={counts.resolved} tone="green" />
      </div>

      {/* ACTIONS */}

      <div className="flex flex-wrap gap-3">
        {canRaise && (
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="inline-flex items-center gap-2 rounded-lg bg-apc-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            {showForm ? "Close Form" : "Raise Issue"}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            void load();
          }}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* FORM */}

      {showForm && canRaise && raiseLevel && raiseScopeId && (
        <RaiseIssueForm
          raisedBy={userId}
          scopeLevel={raiseLevel}
          scopeId={raiseScopeId}
          scopeWardId={
            authority.level === "polling_unit" || authority.level === "ward"
              ? (scope?.wardIds[0] ?? profile.ward_id ?? null)
              : null
          }
          submitting={submitting}
          onCancel={() => setShowForm(false)}
          onSubmit={async (input) => {
            try {
              setSubmitting(true);
              await raiseCampaignIssue({
                raised_by: userId,
                title: input.title,
                description: input.description,
                issue_type: input.issue_type,
                priority: input.priority,
                location: input.location,
                scope_level: raiseLevel,
                scope_id: raiseScopeId,
                scope_ward_id: input.scopeWardId,
              });

              notify.success("Issue raised. Your coordinators can see it now.");
              setShowForm(false);
              await load();
            } catch (error) {
              console.error("Failed to raise issue:", error);
              notify.error("Unable to raise the issue. Please try again.");
            } finally {
              setSubmitting(false);
            }
          }}
        />
      )}

      {/* LIST */}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isAdmin ? "Issues in view" : "Issues in my area"}
          </CardTitle>

          <p className="mt-1 text-sm text-gray-500">
            {isCoordinator || isAdmin
              ? "Issues raised at your scope and everything below it."
              : "Issues you raised. Coordinators above you can see them too."}
          </p>
        </CardHeader>

        <CardContent>
          {visibleIssues.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <TriangleAlert className="mx-auto h-8 w-8 text-gray-300" />

              <p className="mt-3 font-semibold text-gray-900">
                No issues reported yet
              </p>

              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                {canRaise
                  ? "When something needs attention in your area, raise an issue and it will reach the coordinators above you."
                  : "Once your profile has a registered polling unit you can raise issues from your area."}
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {visibleIssues.map((issue) => {
                const canAct = isAdmin || isCoordinator;

                return (
                  <li key={issue.id} className="rounded-xl border p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-gray-900">
                            {issue.title}
                          </h3>

                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[issue.status]}`}
                          >
                            {STATUS_LABELS[issue.status]}
                          </span>

                          {issue.priority && (
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                              {issue.priority}
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-sm leading-6 text-gray-600">
                          {issue.description}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {describeScope(
                              issue.scope_level,
                              issue.scope_id,
                              lookup.lgas,
                            )}
                          </span>

                          <span>
                            Raised by{" "}
                            {names.get(issue.raised_by) ?? "Unknown member"}
                          </span>

                          {issue.acknowledged_by && (
                            <span>
                              Acknowledged by{" "}
                              {names.get(issue.acknowledged_by) ??
                                "Unknown member"}
                            </span>
                          )}

                          {issue.resolution_notes && (
                            <span className="text-green-700">
                              {issue.resolution_notes}
                            </span>
                          )}
                        </div>
                      </div>

                      {canAct && issue.status !== "resolved" && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {issue.status === "open" && (
                            <button
                              type="button"
                              disabled={busyIssueId === issue.id}
                              onClick={() => void handleAcknowledge(issue)}
                              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                              Acknowledge
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={busyIssueId === issue.id}
                            onClick={() =>
                              setResolvingId(
                                resolvingId === issue.id ? null : issue.id,
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Resolve
                          </button>
                        </div>
                      )}
                    </div>

                    {resolvingId === issue.id && (
                      <div className="mt-4 rounded-lg border bg-gray-50 p-4">
                        <label
                          htmlFor={`resolution-${issue.id}`}
                          className="block text-sm font-medium text-gray-700"
                        >
                          Resolution notes (optional)
                        </label>

                        <textarea
                          id={`resolution-${issue.id}`}
                          value={resolutionNotes}
                          onChange={(event) =>
                            setResolutionNotes(event.target.value)
                          }
                          rows={2}
                          className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-apc-primary"
                          placeholder="What was done to resolve this?"
                        />

                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setResolvingId(null);
                              setResolutionNotes("");
                            }}
                            className="rounded-lg border px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-white"
                          >
                            Cancel
                          </button>

                          <button
                            type="button"
                            disabled={busyIssueId === issue.id}
                            onClick={() => void handleResolve(issue)}
                            className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            Confirm resolved
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* COORDINATORS NOTE */}

      {!isCoordinator && !isAdmin && (
        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="flex gap-3 p-5">
            <ShieldAlert className="h-5 w-5 shrink-0 text-blue-700" />

            <p className="text-sm leading-6 text-blue-900">
              You can raise and follow your own issues. Your ward coordinator
              handles them from here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ============================================================
 * RAISE FORM
 * ============================================================ */

interface RaiseFormInput {
  title: string;
  description: string;
  issue_type: string;
  priority: "low" | "medium" | "high" | "urgent";
  location: string;
  scopeWardId: string | null;
}

function RaiseIssueForm({
  raisedBy,
  scopeLevel,
  scopeId,
  scopeWardId,
  submitting,
  onCancel,
  onSubmit,
}: {
  raisedBy: string;
  scopeLevel: ScopeType;
  scopeId: string;
  scopeWardId: string | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: RaiseFormInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issueType, setIssueType] = useState("other");
  const [priority, setPriority] =
    useState<RaiseFormInput["priority"]>("medium");
  const [location, setLocation] = useState("");

  const lookup = useElectoralLookup();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim() || !description.trim()) {
      notify.error("Add a title and a description before raising the issue.");
      return;
    }

    await onSubmit({
      title,
      description,
      issue_type: issueType,
      priority,
      location,
      scopeWardId,
    });
  }

  void raisedBy;

  return (
    <Card className="border-apc-primary/20">
      <CardHeader>
        <CardTitle className="text-lg">Raise an issue</CardTitle>

        <p className="mt-1 text-sm text-gray-500">
          Filed against {describeScope(scopeLevel, scopeId, lookup.lgas)}.
        </p>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="issue-title"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Title
            </label>

            <input
              id="issue-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              placeholder="Short summary of the issue"
            />
          </div>

          <div>
            <label
              htmlFor="issue-description"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Description
            </label>

            <textarea
              id="issue-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              placeholder="What happened, where, and who is affected?"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="issue-type"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Type
              </label>

              <select
                id="issue-type"
                value={issueType}
                onChange={(event) => setIssueType(event.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              >
                <option value="logistics">Logistics</option>
                <option value="campaign_activity">Campaign Activity</option>
                <option value="community_concern">Community Concern</option>
                <option value="volunteer">Volunteer</option>
                <option value="communication">Communication</option>
                <option value="security">Security</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="issue-priority"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Priority
              </label>

              <select
                id="issue-priority"
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as RaiseFormInput["priority"])
                }
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="issue-location"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Location detail (optional)
            </label>

            <input
              id="issue-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              placeholder="e.g. Ward hall, PU 003"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-apc-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Raise issue
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * STAT CARD
 * ============================================================ */

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "green";
}) {
  const tones: Record<typeof tone, string> = {
    amber: "text-amber-700",
    blue: "text-blue-700",
    green: "text-green-700",
  };

  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </p>

        <p className={`mt-2 text-2xl font-bold ${tones[tone]}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
