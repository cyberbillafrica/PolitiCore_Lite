"use client";

/*
 * ============================================================
 * CAMPAIGN ASSIGNMENTS
 * ============================================================
 *
 * An assignment targets one person, a scope, or both:
 *
 *   individual  -> assigned_to_user, one completion
 *   scope       -> assigned_to_scope, one completion per targeted member
 *   both        -> every targeted member tracked individually
 *
 * Visible to:
 *
 *   the assignee, the assignment creator, every coordinator whose scope
 *   covers the target, and admin.
 *
 * Creation is authorisation-checked with `canCreateAt()` before the
 * write: a coordinator may target their own scope or anything below
 * it, never above or sideways.
 */

import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import ScopePicker, { type ScopeValue } from "@/components/campaign/ScopePicker";

import { useAuth } from "@/contexts/AuthContext";
import { useCampaignAuthority } from "@/hooks/useCampaignAuthority";

import { notify } from "@/lib/notify";

import {
  closeAssignmentIfComplete,
  createCampaignAssignment,
  deleteCampaignAssignment,
  getAllCampaignAssignments,
  getAssignmentCompletions,
  getAssignmentsForUser,
  getAssignmentsInScope,
  reviewCompletion,
  setAssignmentStatus,
  targetWardIdForScope,
  type CampaignAssignment,
} from "@/lib/firebase/campaignAssignments";

import {
  getAllCampaignMembers,
  getCampaignMembersInScope,
  type ScopedCampaignMember,
} from "@/lib/firebase/campaignMembers";

import { formatOrganizationalPosition, formatScopeType } from "@/lib/organization";
import { resolveUserNames } from "@/lib/userNames";

import type {
  AssignmentCompletion,
  OrganizationalPosition,
  ScopeType,
} from "@/types";

/* ============================================================
 * CONSTANTS
 * ============================================================ */

const LEVEL_ORDER: ScopeType[] = [
  "state",
  "senatorial_zone",
  "lga",
  "ward",
  "polling_unit",
];

const ROLE_FILTERS: { value: OrganizationalPosition | ""; label: string }[] = [
  { value: "", label: "All members in scope" },
  { value: "pu_coordinator", label: "PU coordinators only" },
  { value: "ward_coordinator", label: "Ward coordinators only" },
  { value: "lga_coordinator", label: "LGA coordinators only" },
  { value: "zone_coordinator", label: "Zonal coordinators only" },
  { value: "state_coordinator", label: "State coordinators only" },
];

type StatusFilter = "all" | "open" | "closed";
type TargetFilter = "all" | "individual" | "scope";
type RoleView = "all" | "creator" | "assignee";

interface FormState {
  title: string;
  description: string;
  dueAt: string;
  priority: NonNullable<CampaignAssignment["priority"]>;
  mode: "individual" | "scope" | "both";
  targetUserId: string;
  scope: ScopeValue | null;
  roleFilter: OrganizationalPosition | "";
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  dueAt: "",
  priority: "medium",
  mode: "individual",
  targetUserId: "",
  scope: null,
  roleFilter: "",
};

/* ============================================================
 * PAGE
 * ============================================================ */

export default function CampaignAssignmentsPage() {
  const { user } = useAuth();

  const {
    profile,
    hasPermission,
    loading: authorityLoading,
    isAdmin,
    authority,
    scope,
    scopeLabel,
    isCoordinator,
    positionLevel,
    canCreateAt,
    grants,
  } = useCampaignAuthority();

  const userId = user?.uid ?? profile?.id ?? "";

  const [assignments, setAssignments] = useState<CampaignAssignment[]>([]);
  const [members, setMembers] = useState<ScopedCampaignMember[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [completions, setCompletions] = useState<
    Record<string, AssignmentCompletion[]>
  >({});
  const [completionsLoading, setCompletionsLoading] = useState(false);
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [targetFilter, setTargetFilter] = useState<TargetFilter>("all");
  const [roleView, setRoleView] = useState<RoleView>("all");

  const canCreate = isAdmin || (isCoordinator && hasPermission("create_assignment"));

  /* ------------------------------------------------------------
   * LEVELS THE CREATOR MAY TARGET
   * ------------------------------------------------------------ */

  const allowedLevels = useMemo<ScopeType[]>(() => {
    if (isAdmin) return LEVEL_ORDER;

    const start = positionLevel ? LEVEL_ORDER.indexOf(positionLevel) : -1;
    if (start < 0) return [];
    return LEVEL_ORDER.slice(start);
  }, [isAdmin, positionLevel]);

  /* ------------------------------------------------------------
   * LOAD
   * ------------------------------------------------------------ */

  const loadAssignments = useCallback(async () => {
    if (!userId || !profile) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    const byId = new Map<string, CampaignAssignment>();

    try {
      const mine = await getAssignmentsForUser(userId);
      for (const item of mine) byId.set(item.id, item);

      if (isAdmin) {
        const all = await getAllCampaignAssignments();
        for (const item of all) byId.set(item.id, item);
      } else if (scope?.level && scope.scope_id) {
        const inScope = await getAssignmentsInScope(scope, grants, {
          viewerId: userId,
        });
        for (const item of inScope) byId.set(item.id, item);
      }

      const values = Array.from(byId.values());

      const resolvedNames = await resolveUserNames(
        values.flatMap((item) => [
          item.created_by,
          item.assigned_to_user ?? "",
        ]),
      );

      setAssignments(values);
      setNames(resolvedNames);
    } catch (error) {
      console.error("Failed to load campaign assignments:", error);
      notify.error("Unable to load campaign assignments.");
      setAssignments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile, userId, isAdmin, scope?.level, scope?.scope_id, grants]);

  const loadMembers = useCallback(async () => {
    if (!canCreate) {
      setMembers([]);
      return;
    }

    try {
      if (isAdmin) {
        setMembers(await getAllCampaignMembers());
        return;
      }

      if (scope) {
        setMembers(await getCampaignMembersInScope(scope, grants));
        return;
      }

      setMembers([]);
    } catch (error) {
      console.error("Failed to load campaign members for assignment targets:", error);
      setMembers([]);
    }
  }, [canCreate, grants, isAdmin, scope]);

  useEffect(() => {
    if (authorityLoading) return;

    let cancelled = false;

    (async () => {
      if (cancelled) return;
      await loadAssignments();
    })();

    return () => {
      cancelled = true;
    };
  }, [authorityLoading, loadAssignments]);

  useEffect(() => {
    if (authorityLoading) return;
    void loadMembers();
  }, [authorityLoading, loadMembers]);

  /* ------------------------------------------------------------
   * COMPLETIONS
   * ------------------------------------------------------------ */

  const loadCompletions = useCallback(
    async (assignmentId: string) => {
      try {
        setCompletionsLoading(true);

        const rows = await getAssignmentCompletions(assignmentId);

        const resolved = await resolveUserNames(rows.map((row) => row.user_id));

        setCompletions((current) => ({ ...current, [assignmentId]: rows }));
        setNames((current) => {
          const next = new Map(current);
          for (const [key, value] of resolved) next.set(key, value);
          return next;
        });
      } catch (error) {
        console.error("Failed to load assignment completions:", error);
        notify.error("Unable to load completion status for this assignment.");
      } finally {
        setCompletionsLoading(false);
      }
    },
    [],
  );

  async function toggleExpanded(assignment: CampaignAssignment) {
    if (expandedId === assignment.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(assignment.id);

    /*
     * Per-person completions are readable only by the assignment's
     * creator and by admin (the completions read clause). A member who
     * was merely targeted by the assignment must not issue the
     * subcollection read: it would be denied as a whole.
     */
    const canSeeCompletions = isAdmin || assignment.created_by === userId;

    if (
      canSeeCompletions &&
      assignment.completion_mode === "per_person" &&
      !completions[assignment.id]
    ) {
      await loadCompletions(assignment.id);
    }
  }

  /* ------------------------------------------------------------
   * CREATE
   * ------------------------------------------------------------ */

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userId || !profile) {
      notify.error("Your profile is still loading. Please try again.");
      return;
    }

    const title = form.title.trim();
    if (!title) {
      notify.error("Give the assignment a title.");
      return;
    }

    const wantsUser = form.mode === "individual" || form.mode === "both";
    const wantsScope = form.mode === "scope" || form.mode === "both";

    if (wantsUser && !form.targetUserId) {
      notify.error("Select the member this assignment is for.");
      return;
    }

    if (wantsScope && !form.scope) {
      notify.error("Choose the scope this assignment targets.");
      return;
    }

    if (wantsScope && form.scope && !canCreateAt({ level: form.scope.level, scopeId: form.scope.scope_id })) {
      notify.error(
        "That scope is outside your authority. Target your own area or one below it.",
      );
      return;
    }

    try {
      setCreating(true);

      const targetWardId = wantsScope
        ? await targetWardIdForScope(
            form.scope
              ? {
                  level: form.scope.level,
                  scope_id: form.scope.scope_id,
                  role_filter: form.roleFilter || null,
                }
              : null,
          )
        : null;

      await createCampaignAssignment({
        title,
        description: form.description,
        created_by: userId,
        assigned_to_user: wantsUser ? form.targetUserId : null,
        assigned_to_scope:
          wantsScope && form.scope
            ? {
                level: form.scope.level,
                scope_id: form.scope.scope_id,
                role_filter: form.roleFilter || null,
              }
            : null,
        due_at: form.dueAt || null,
        priority: form.priority,
        created_scope:
          authority.level && authority.scopeId
            ? { level: authority.level, scope_id: authority.scopeId }
            : null,
        target_ward_id: targetWardId,
      });

      setForm(EMPTY_FORM);
      setShowForm(false);

      notify.success("Assignment created successfully.");

      await loadAssignments();
    } catch (error) {
      console.error("Failed to create assignment:", error);
      notify.error("Unable to create the assignment.");
    } finally {
      setCreating(false);
    }
  }

  /* ------------------------------------------------------------
   * STATUS / DELETE
   * ------------------------------------------------------------ */

  async function handleClose(assignment: CampaignAssignment) {
    const next = assignment.status === "open" ? "closed" : "open";

    try {
      await setAssignmentStatus(assignment.id, next);
      notify.success(
        next === "closed" ? "Assignment closed." : "Assignment reopened.",
      );
      await loadAssignments();
    } catch (error) {
      console.error("Failed to change assignment status:", error);
      notify.error("Unable to change the assignment status.");
    }
  }

  async function handleDelete(assignmentId: string) {
    try {
      await deleteCampaignAssignment(assignmentId);
      setDeleteConfirmId(null);
      if (expandedId === assignmentId) setExpandedId(null);
      notify.success("Assignment deleted.");
      await loadAssignments();
    } catch (error) {
      console.error("Failed to delete assignment:", error);
      notify.error("Unable to delete the assignment.");
    }
  }

  /* ------------------------------------------------------------
   * REVIEW
   * ------------------------------------------------------------ */

  async function handleReview(
    assignment: CampaignAssignment,
    completion: AssignmentCompletion,
    status: "approved" | "rejected",
  ) {
    if (!userId) return;

    const key = `${assignment.id}:${completion.user_id}`;

    try {
      setReviewingKey(key);

      await reviewCompletion({
        assignmentId: assignment.id,
        userId: completion.user_id,
        status,
        reviewedBy: userId,
      });

      const closed = await closeAssignmentIfComplete(assignment.id);

      notify.success(
        status === "approved"
          ? "Completion approved."
          : "Completion rejected — the member can resubmit.",
      );

      if (closed) {
        notify.info("Every targeted member is approved — the assignment is now closed.");
      }

      await loadCompletions(assignment.id);
      await loadAssignments();
    } catch (error) {
      console.error("Failed to review completion:", error);
      notify.error("Unable to record that decision.");
    } finally {
      setReviewingKey(null);
    }
  }

  /* ------------------------------------------------------------
   * FILTERS
   * ------------------------------------------------------------ */

  const isMine = useCallback(
    (assignment: CampaignAssignment) => {
      if (assignment.assigned_to_user && assignment.assigned_to_user === userId) {
        return true;
      }

      if (assignment.assigned_to && assignment.assigned_to === userId) {
        return true;
      }

      const target = assignment.assigned_to_scope;
      if (!target || !authority.level || !authority.scopeId) return false;

      if (target.level === authority.level && target.scope_id === authority.scopeId) {
        return true;
      }

      return Boolean(
        scope?.wardIds.includes(target.scope_id) ||
          scope?.lgaIds.includes(target.scope_id),
      );
    },
    [authority.level, authority.scopeId, scope?.lgaIds, scope?.wardIds, userId],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return assignments.filter((assignment) => {
      if (statusFilter !== "all" && assignment.status !== statusFilter) {
        return false;
      }

      if (targetFilter === "individual" && assignment.completion_mode !== "individual") {
        return false;
      }

      if (targetFilter === "scope" && assignment.completion_mode !== "per_person") {
        return false;
      }

      if (roleView === "creator" && assignment.created_by !== userId) return false;
      if (roleView === "assignee" && !isMine(assignment)) return false;

      if (!term) return true;

      const haystack = [
        assignment.title,
        assignment.description ?? "",
        assignment.assigned_to_scope?.scope_id ?? "",
        assignment.assigned_to_scope?.level ?? "",
        assignment.priority ?? "",
        assignment.status,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [assignments, isMine, roleView, search, statusFilter, targetFilter, userId]);

  const counts = useMemo(
    () => ({
      total: assignments.length,
      open: assignments.filter((item) => item.status === "open").length,
      closed: assignments.filter((item) => item.status === "closed").length,
      mine: assignments.filter((item) => isMine(item)).length,
      created: assignments.filter((item) => item.created_by === userId).length,
    }),
    [assignments, isMine, userId],
  );

  /* ------------------------------------------------------------
   * GUARDS
   * ------------------------------------------------------------ */

  if (authorityLoading || loading) {
    return <AssignmentsLoading />;
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-6 pb-10">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/portal/dashboard"
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-apc-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Campaign Dashboard
          </Link>

          <p className="text-sm font-semibold text-apc-primary">Campaign Council</p>

          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
            Campaign Assignments
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Assign work to a member or to a whole scope, and track each
            person&apos;s completion separately.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void loadAssignments();
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={() => {
                setForm(EMPTY_FORM);
                setShowForm((current) => !current);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-apc-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-apc-dark"
            >
              <Plus className="h-4 w-4" />
              {showForm ? "Close" : "Create Assignment"}
            </button>
          )}
        </div>
      </div>

      {/* SCOPE */}
      <Card className="border-apc-primary/10">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-apc-primary/10 text-apc-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {isAdmin ? "Administrator" : "Your Authority"}
              </p>

              <p className="mt-1 font-semibold text-gray-900">
                {isAdmin
                  ? "State-wide — every assignment"
                  : authority.position
                    ? formatOrganizationalPosition(authority.position)
                    : "Campaign Member"}
              </p>

              <p className="mt-1 text-sm text-gray-500">
                {isAdmin
                  ? "You can read and create assignments anywhere."
                  : scopeLabel}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CREATE FORM */}
      {showForm && canCreate && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">Create Assignment</CardTitle>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(EMPTY_FORM);
                }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Close assignment form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Title
                </label>
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Roadshow visibility update"
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="What needs to be done?"
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Due date
                  </label>
                  <input
                    type="date"
                    value={form.dueAt}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, dueAt: event.target.value }))
                    }
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Priority
                  </label>
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        priority: event.target.value as FormState["priority"],
                      }))
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

              {/* TARGET MODE */}
              <fieldset>
                <legend className="mb-2 block text-sm font-medium text-gray-700">
                  Who is this for?
                </legend>

                <div className="grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      { value: "individual", label: "Assign to individual" },
                      { value: "scope", label: "Assign to scope" },
                      { value: "both", label: "Both" },
                    ] as const
                  ).map((option) => (
                    <label
                      key={option.value}
                      className={`cursor-pointer rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                        form.mode === option.value
                          ? "border-apc-primary bg-apc-primary/5 text-apc-primary"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="target-mode"
                        value={option.value}
                        checked={form.mode === option.value}
                        onChange={() =>
                          setForm((current) => ({
                            ...current,
                            mode: option.value,
                          }))
                        }
                        className="mr-2"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {(form.mode === "individual" || form.mode === "both") && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Member
                  </label>

                  <select
                    value={form.targetUserId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        targetUserId: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
                  >
                    <option value="">Select a campaign member</option>

                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name || member.email || "Unknown member"}
                      </option>
                    ))}
                  </select>

                  {members.length === 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                      No members in your scope yet.
                    </p>
                  )}
                </div>
              )}

              {(form.mode === "scope" || form.mode === "both") && (
                <div className="space-y-4 rounded-xl border bg-gray-50/60 p-4">
                  {allowedLevels.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Your position cannot target a scope.
                    </p>
                  ) : (
                    <>
                      <ScopePicker
                        idPrefix="assignment-target"
                        label="Target scope"
                        value={form.scope}
                        onChange={(next) =>
                          setForm((current) => ({ ...current, scope: next }))
                        }
                        levels={allowedLevels}
                        hint={`You can target ${allowedLevels
                          .map((level) => formatScopeType(level))
                          .join(" or ")} and anything below.`}
                      />

                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Role filter
                        </label>
                        <select
                          value={form.roleFilter}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              roleFilter: event.target.value as FormState["roleFilter"],
                            }))
                          }
                          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
                        >
                          {ROLE_FILTERS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>

                        <p className="mt-2 text-xs text-gray-500">
                          Leave on &ldquo;all members&rdquo; to assign everyone in the
                          scope. The filter narrows the targeted set to one position.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setForm(EMPTY_FORM);
                  }}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-apc-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-apc-dark disabled:opacity-50"
                >
                  {creating ? "Saving..." : "Create Assignment"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* COUNTS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="In view" value={counts.total} />
        <SummaryCard label="Open" value={counts.open} />
        <SummaryCard label="Closed" value={counts.closed} />
        <SummaryCard label="Targeting me" value={counts.mine} />
      </div>

      {/* FILTERS */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-lg">
                {isAdmin ? "All Assignments" : "Assignments Within My Area"}
              </CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                {isAdmin
                  ? "State-wide view of every campaign assignment."
                  : "Work targeted at your area, or created by you."}
              </p>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-3 lg:w-auto">
              <div className="relative sm:col-span-3 lg:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter assignments..."
                  className="w-full rounded-lg border bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-apc-primary"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                className="rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-apc-primary"
              >
                <option value="all">Any status</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>

              <select
                value={targetFilter}
                onChange={(event) =>
                  setTargetFilter(event.target.value as TargetFilter)
                }
                className="rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-apc-primary"
              >
                <option value="all">Any target</option>
                <option value="individual">Individual</option>
                <option value="scope">Scope</option>
              </select>

              <select
                value={roleView}
                onChange={(event) => setRoleView(event.target.value as RoleView)}
                className="rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-apc-primary"
              >
                <option value="all">Any role</option>
                <option value="creator">Created by me</option>
                <option value="assignee">Targets me</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {visible.length === 0 ? (
            <EmptyState
              title={
                assignments.length === 0
                  ? "No assignments yet"
                  : "No assignments match these filters"
              }
              description={
                assignments.length === 0
                  ? "Nothing has been assigned in your area yet. When a coordinator creates work, it appears here."
                  : "Clear the search or widen the filters to see the rest."
              }
            />
          ) : (
            <div className="space-y-3">
              {visible.map((assignment) => (
                <AssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  names={names}
                  isAdmin={isAdmin}
                  canManage={isAdmin || assignment.created_by === userId}
                  isMine={isMine(assignment)}
                  expanded={expandedId === assignment.id}
                  completions={completions[assignment.id] ?? []}
                  completionsLoading={completionsLoading && expandedId === assignment.id}
                  reviewingKey={reviewingKey}
                  deleteConfirmId={deleteConfirmId}
                  onToggle={() => void toggleExpanded(assignment)}
                  onClose={() => void handleClose(assignment)}
                  onDeleteRequest={() => setDeleteConfirmId(assignment.id)}
                  onDeleteCancel={() => setDeleteConfirmId(null)}
                  onDeleteConfirm={() => void handleDelete(assignment.id)}
                  onReview={(completion, status) =>
                    void handleReview(assignment, completion, status)
                  }
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
 * ASSIGNMENT CARD
 * ============================================================ */

function AssignmentCard({
  assignment,
  names,
  isAdmin,
  canManage,
  isMine,
  expanded,
  completions,
  completionsLoading,
  reviewingKey,
  deleteConfirmId,
  onToggle,
  onClose,
  onDeleteRequest,
  onDeleteCancel,
  onDeleteConfirm,
  onReview,
}: {
  assignment: CampaignAssignment;
  names: Map<string, string>;
  isAdmin: boolean;
  canManage: boolean;
  isMine: boolean;
  expanded: boolean;
  completions: AssignmentCompletion[];
  completionsLoading: boolean;
  reviewingKey: string | null;
  deleteConfirmId: string | null;
  onToggle: () => void;
  onClose: () => void;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
  onReview: (
    completion: AssignmentCompletion,
    status: "approved" | "rejected",
  ) => void;
}) {
  const target = assignment.assigned_to_scope;

  const targetLabel = target
    ? `${formatScopeType(target.level)} · ${target.scope_id}`
    : "Individual";

  const assigneeName =
    (assignment.assigned_to_user && names.get(assignment.assigned_to_user)) ||
    (assignment.assigned_to && names.get(assignment.assigned_to)) ||
    "Unassigned";

  const approved = completions.filter((row) => row.status === "approved").length;
  const submitted = completions.filter((row) => row.status === "submitted").length;

  return (
    <div className="rounded-xl border bg-white transition hover:shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 p-4 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900">{assignment.title}</h3>

            <PriorityBadge priority={assignment.priority} />
            <StatusBadge status={assignment.status} />

            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
              {assignment.completion_mode === "per_person"
                ? "Per person"
                : "Individual"}
            </span>

            {isMine && (
              <span className="rounded-full bg-apc-primary/10 px-2 py-0.5 text-[11px] font-semibold text-apc-primary">
                For you
              </span>
            )}
          </div>

          {assignment.description && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-500">
              {assignment.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
            <span className="rounded-lg bg-gray-100 px-2.5 py-1">
              Target: {targetLabel}
            </span>

            {target?.role_filter && (
              <span className="rounded-lg bg-gray-100 px-2.5 py-1">
                Role: {formatRole(target.role_filter)}
              </span>
            )}

            {assignment.completion_mode === "individual" && (
              <span className="rounded-lg bg-gray-100 px-2.5 py-1">
                {assigneeName}
              </span>
            )}

            {assignment.due_at && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1">
                <CalendarDays className="h-3.5 w-3.5" />
                Due {formatDate(assignment.due_at)}
              </span>
            )}

            <span className="rounded-lg bg-gray-100 px-2.5 py-1">
              {names.get(assignment.created_by) ?? "Unknown member"}
            </span>
          </div>
        </div>

        <span className="shrink-0 text-gray-400">
          {expanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t bg-gray-50/60 p-4">
          {assignment.completion_mode === "per_person" ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">
                  Completions
                </p>

                <p className="text-xs text-gray-500">
                  {completions.length === 0
                    ? "No members targeted yet"
                    : `${approved} approved · ${submitted} awaiting review · ${completions.length} targeted`}
                </p>
              </div>

              {completionsLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading completion status...
                </div>
              ) : completions.length === 0 ? (
                <p className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-gray-500">
                  No completions yet. Targeted members appear here as soon as the
                  assignment is created.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border bg-white">
                  {completions.map((row) => {
                    const key = `${assignment.id}:${row.user_id}`;
                    const busy = reviewingKey === key;

                    return (
                      <li
                        key={row.id}
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {names.get(row.user_id) ?? "Unknown member"}
                          </p>

                          <p className="mt-0.5 text-xs text-gray-500">
                            {completionStatusLabel(row.status)}
                            {row.review_notes ? ` · ${row.review_notes}` : ""}
                          </p>
                        </div>

                        {canManage && row.status === "submitted" && (
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onReview(row, "approved")}
                              className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approve
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onReview(row, "rejected")}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm font-semibold text-gray-900">
                {assigneeName}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {completionStatusLabel(
                  completions.find((row) => row.user_id === assignment.assigned_to_user)
                    ?.status ?? "pending",
                )}
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isMine && assignment.status === "open" && (
              <Link
                href="/portal/campaign/reports"
                className="inline-flex items-center gap-1 rounded-md border border-apc-primary/30 bg-white px-3 py-1.5 text-xs font-semibold text-apc-primary hover:bg-apc-primary/5"
              >
                Submit report
              </Link>
            )}

            {canManage && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {assignment.status === "open" ? "Close assignment" : "Reopen assignment"}
                </button>

                {deleteConfirmId === assignment.id ? (
                  <span className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onDeleteConfirm}
                      className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Yes, delete
                    </button>

                    <button
                      type="button"
                      onClick={onDeleteCancel}
                      className="rounded-md border bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onDeleteRequest}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </>
            )}

            {isAdmin && !canManage && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <Users className="h-3.5 w-3.5" />
                Created by another account
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * SMALL COMPONENTS
 * ============================================================ */

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      </CardContent>
    </Card>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: CampaignAssignment["priority"];
}) {
  const classes: Record<string, string> = {
    low: "bg-gray-100 text-gray-600",
    medium: "bg-blue-100 text-blue-700",
    high: "bg-orange-100 text-orange-700",
    urgent: "bg-red-100 text-red-700",
  };

  const key = priority ?? "medium";

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${classes[key]}`}
    >
      {key}
    </span>
  );
}

function StatusBadge({ status }: { status: CampaignAssignment["status"] }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        status === "open"
          ? "bg-green-100 text-green-700"
          : "bg-gray-200 text-gray-700"
      }`}
    >
      {status === "open" ? "Open" : "Closed"}
    </span>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <CheckCircle2 className="mx-auto h-8 w-8 text-gray-300" />
      <p className="mt-3 font-semibold text-gray-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{description}</p>
    </div>
  );
}

function AssignmentsLoading() {
  return (
    <div className="space-y-6 pb-10">
      <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
    </div>
  );
}

/* ============================================================
 * FORMATTERS
 * ============================================================ */

function completionStatusLabel(status: AssignmentCompletion["status"]): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected — can resubmit";
    case "submitted":
      return "Submitted, awaiting review";
    default:
      return "Pending — nothing submitted yet";
  }
}

function formatRole(role: OrganizationalPosition): string {
  return formatOrganizationalPosition(role);
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
