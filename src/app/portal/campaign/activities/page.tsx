"use client";

/*
 * ============================================================
 * CAMPAIGN ACTIVITIES
 * ============================================================
 *
 * An activity is created at a scope and is visible to that scope and
 * everything below it. The visibility maths lives in the data layer
 * (`getActivitiesInScope`), so this page never filters by polling unit
 * itself.
 *
 * Creation starts at polling-unit coordinator and above. A plain
 * member sees the list but no Create button, and never sees the admin
 * scope filter.
 */

import Link from "next/link";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  CalendarDays,
  ChevronLeft,
  Clock,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import ScopePicker, { type ScopeValue } from "@/components/campaign/ScopePicker";

import { useCampaignAuthority } from "@/hooks/useCampaignAuthority";

import {
  createCampaignActivity,
  deleteCampaignActivity,
  getActivitiesForAdminScope,
  getActivitiesInScope,
  updateCampaignActivity,
  type CampaignActivityRecord,
} from "@/lib/firebase/campaignActivities";

import { formatScopeType } from "@/lib/organization";
import { notify } from "@/lib/notify";

import type {
  CampaignActivityStatus,
  CampaignActivityType,
  ScopeType,
} from "@/types";

/* ============================================================
 * LABELS
 * ============================================================ */

const ACTIVITY_TYPES: { value: CampaignActivityType; label: string }[] = [
  { value: "meeting", label: "Meeting" },
  { value: "rally", label: "Rally" },
  { value: "community_engagement", label: "Community Engagement" },
  { value: "training", label: "Training" },
  { value: "coordination", label: "Coordination" },
  { value: "stakeholder_meeting", label: "Stakeholder Meeting" },
  { value: "other", label: "Other" },
];

const ACTIVITY_STATUSES: CampaignActivityStatus[] = [
  "scheduled",
  "ongoing",
  "completed",
  "cancelled",
];

function activityTypeLabel(type: CampaignActivityType): string {
  return ACTIVITY_TYPES.find((item) => item.value === type)?.label ?? type;
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClasses(status: CampaignActivityStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700";
    case "cancelled":
      return "bg-gray-100 text-gray-600";
    case "ongoing":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-amber-100 text-amber-700";
  }
}

function formatDate(value: string): string {
  if (!value) return "Date not set";

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ============================================================
 * PAGE
 * ============================================================ */

export default function CampaignActivitiesPage() {
  const {
    profile,
    loading: authorityLoading,
    isAdmin,
    scope,
    scopeLabel,
    isCoordinator,
    authority,
    canCreateAt,
    grants,
  } = useCampaignAuthority();

  const [activities, setActivities] = useState<CampaignActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<CampaignActivityStatus | "all">(
    "all",
  );

  const [adminFilter, setAdminFilter] = useState<ScopeValue | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const scopeLevel = scope?.level ?? null;
  const scopeId = scope?.scope_id ?? null;

  const filterLevel = adminFilter?.level ?? null;
  const filterScopeId = adminFilter?.scope_id ?? null;

  /* ------------------------------------------------------------
   * CREATE PERMISSION
   * ------------------------------------------------------------ */

  const canCreate = useMemo(() => {
    if (isAdmin) return true;
    if (!isCoordinator || !authority.level || !authority.scopeId) return false;

    return canCreateAt({
      level: authority.level,
      scopeId: authority.scopeId,
    });
  }, [authority.level, authority.scopeId, canCreateAt, isAdmin, isCoordinator]);

  /* ------------------------------------------------------------
   * LOAD
   * ------------------------------------------------------------ */

  const loadActivities = useCallback(async () => {
    if (authorityLoading) return;

    setLoading(true);

    try {
      if (isAdmin) {
        const data = filterLevel
          ? await getActivitiesForAdminScope(filterLevel, filterScopeId)
          : await getActivitiesForAdminScope(null, null);

        setActivities(data);
        return;
      }

      if (!scopeLevel || !scopeId) {
        setActivities([]);
        return;
      }

      const data = await getActivitiesInScope(
        {
          level: scopeLevel,
          scope_id: scopeId,
          label: scopeLabel,
          lgaIds: scope?.lgaIds ?? [],
          wardIds: scope?.wardIds ?? [],
          pollingUnitIds: scope?.pollingUnitIds ?? [],
        },
        grants,
      );

      setActivities(data);
    } catch (error) {
      console.error("Failed to load campaign activities:", error);
      setActivities([]);
      notify.error("Unable to load campaign activities right now.");
    } finally {
      setLoading(false);
    }
  }, [
    authorityLoading,
    filterLevel,
    filterScopeId,
    isAdmin,
    scope?.lgaIds,
    scope?.pollingUnitIds,
    scope?.wardIds,
    scopeId,
    scopeLabel,
    scopeLevel,
    profile,
    grants,
  ]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  /* ------------------------------------------------------------
   * FILTERED LIST
   * ------------------------------------------------------------ */

  const visible = useMemo(() => {
    if (statusFilter === "all") return activities;

    return activities.filter((activity) => activity.status === statusFilter);
  }, [activities, statusFilter]);

  /* ------------------------------------------------------------
   * GUARDS
   * ------------------------------------------------------------ */

  if (authorityLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading campaign activities…</span>
      </div>
    );
  }

  if (!profile) return null;

  const noScope = !isAdmin && (!scopeLevel || !scopeId);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      {/* ======================================================
          HEADER
          ====================================================== */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/portal/dashboard"
            className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-apc-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            Campaign Dashboard
          </Link>

          <h1 className="text-2xl font-bold text-gray-900">
            Campaign Activities
          </h1>

          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Meetings, rallies, outreach and training visible from your scope and
            everything below it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadActivities()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={() => setShowForm((value) => !value)}
              className="inline-flex items-center gap-2 rounded-lg bg-apc-primary px-4 py-2 text-sm font-semibold text-white hover:bg-apc-dark"
            >
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? "Close Form" : "Create Activity"}
            </button>
          )}
        </div>
      </div>

      {/* ======================================================
          SCOPE STRIP
          ====================================================== */}

      <Card className="border-apc-primary/10">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-apc-primary/10 text-apc-primary">
              <MapPin className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {isAdmin ? "Admin view" : "Your activity scope"}
              </p>

              <p className="text-sm font-semibold text-gray-900">
                {isAdmin ? "All activities, every level" : scopeLabel}
              </p>
            </div>
          </div>

          {isAdmin ? (
            <div className="w-full sm:max-w-xs">
              <ScopePicker
                idPrefix="activities-filter"
                value={adminFilter}
                onChange={setAdminFilter}
                allowAll
                allLabel="All scopes"
                label="Filter by scope"
                showResolvedId={false}
              />
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              Activities from this scope and below are shown.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ======================================================
          CREATE FORM
          ====================================================== */}

      {showForm && canCreate && (
        <CreateActivityForm
          isAdmin={isAdmin}
          ownScope={
            authority.level && authority.scopeId
              ? { level: authority.level, scope_id: authority.scopeId }
              : null
          }
          ownScopeLabel={scopeLabel}
          profileId={profile.id ?? ""}
          profileName={profile.full_name ?? ""}
          creating={creating}
          onCancel={() => setShowForm(false)}
          onSubmit={async (input) => {
            setCreating(true);

            try {
              await createCampaignActivity(input);
              notify.success("Activity created successfully.");
              setShowForm(false);
              await loadActivities();
            } catch (error) {
              console.error("Failed to create campaign activity:", error);
              notify.error("Unable to create the activity. Please try again.");
            } finally {
              setCreating(false);
            }
          }}
        />
      )}

      {/* ======================================================
          NO SCOPE
          ====================================================== */}

      {noScope && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-6">
            <h2 className="font-semibold text-yellow-900">
              No location on file yet
            </h2>

            <p className="mt-1 max-w-2xl text-sm leading-6 text-yellow-800">
              Activities are scoped to your campaign area. Add your registered
              ward and polling unit, or ask an administrator to assign you a
              campaign position, and activities will appear here.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ======================================================
          LIST
          ====================================================== */}

      {!noScope && (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">Activities</CardTitle>

              <p className="mt-1 text-sm text-gray-500">
                {loading
                  ? "Loading…"
                  : `${visible.length} ${visible.length === 1 ? "activity" : "activities"}`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterChip
                label="All"
                active={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
              />

              {ACTIVITY_STATUSES.map((status) => (
                <FilterChip
                  key={status}
                  label={humanize(status)}
                  active={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                />
              ))}
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="flex min-h-40 items-center justify-center gap-3 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading activities…</span>
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <CalendarDays className="mx-auto h-9 w-9 text-gray-300" />

                <p className="mt-3 font-semibold text-gray-900">
                  {activities.length === 0
                    ? "No activities yet"
                    : "No activities match this filter"}
                </p>

                <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                  {activities.length === 0
                    ? "Nothing has been scheduled in your scope yet. New activities created at your level or above will appear here."
                    : "Try a different status filter to see the rest."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visible.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    canManage={
                      isAdmin || activity.created_by === profile.id
                    }
                    onStatusChange={async (next) => {
                      try {
                        await updateCampaignActivity(activity.id, {
                          status: next,
                        });
                        notify.success("Activity status updated.");
                        await loadActivities();
                      } catch (error) {
                        console.error("Failed to update activity:", error);
                        notify.error("Unable to update the activity.");
                      }
                    }}
                    onDelete={async () => {
                      try {
                        await deleteCampaignActivity(activity.id);
                        notify.success("Activity deleted.");
                        await loadActivities();
                      } catch (error) {
                        console.error("Failed to delete activity:", error);
                        notify.error("Unable to delete the activity.");
                      }
                    }}
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
 * CREATE FORM
 * ============================================================ */

function CreateActivityForm({
  isAdmin,
  ownScope,
  ownScopeLabel,
  profileId,
  profileName,
  creating,
  onCancel,
  onSubmit,
}: {
  isAdmin: boolean;
  ownScope: { level: ScopeType; scope_id: string } | null;
  ownScopeLabel: string;
  profileId: string;
  profileName: string;
  creating: boolean;
  onCancel: () => void;
  onSubmit: (
    input: Parameters<typeof createCampaignActivity>[0],
  ) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] =
    useState<CampaignActivityType>("meeting");
  const [status, setStatus] = useState<CampaignActivityStatus>("scheduled");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [venue, setVenue] = useState("");
  const [organizerName, setOrganizerName] = useState(profileName);
  const [expectedAttendance, setExpectedAttendance] = useState("");
  const [adminScope, setAdminScope] = useState<ScopeValue | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      notify.error("Enter an activity title.");
      return;
    }

    if (!date) {
      notify.error("Choose the activity date.");
      return;
    }

    const target = isAdmin ? adminScope : ownScope;

    if (!target) {
      notify.error(
        isAdmin
          ? "Choose the scope this activity belongs to."
          : "Your campaign scope could not be determined.",
      );
      return;
    }

    await onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      activity_type: activityType,
      status,
      date,
      start_time: startTime || undefined,
      end_time: endTime || undefined,
      venue: venue.trim() || undefined,
      scope_type: target.level,
      scope_id: target.scope_id,
      created_by: profileId,
      organizer_id: profileId,
      organizer_name: organizerName.trim() || undefined,
      expected_attendance: expectedAttendance
        ? Number(expectedAttendance)
        : undefined,
    });
  }

  return (
    <Card className="border-apc-primary/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Create Campaign Activity</CardTitle>

        <button
          type="button"
          onClick={onCancel}
          disabled={creating}
          aria-label="Close form"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title" htmlFor="activity-title" className="md:col-span-2">
              <input
                id="activity-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ward mobilisation meeting"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              />
            </Field>

            <Field
              label="Description"
              htmlFor="activity-description"
              className="md:col-span-2"
            >
              <textarea
                id="activity-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="What is happening and who should attend?"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              />
            </Field>

            <Field label="Type" htmlFor="activity-type">
              <select
                id="activity-type"
                value={activityType}
                onChange={(event) =>
                  setActivityType(event.target.value as CampaignActivityType)
                }
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              >
                {ACTIVITY_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Status" htmlFor="activity-status">
              <select
                id="activity-status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as CampaignActivityStatus)
                }
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              >
                {ACTIVITY_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {humanize(item)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Date" htmlFor="activity-date">
              <input
                id="activity-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              />
            </Field>

            <Field label="Venue" htmlFor="activity-venue">
              <input
                id="activity-venue"
                value={venue}
                onChange={(event) => setVenue(event.target.value)}
                placeholder="Town hall, ward square…"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              />
            </Field>

            <Field label="Start time" htmlFor="activity-start">
              <input
                id="activity-start"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              />
            </Field>

            <Field label="End time" htmlFor="activity-end">
              <input
                id="activity-end"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              />
            </Field>

            <Field label="Organizer" htmlFor="activity-organizer">
              <input
                id="activity-organizer"
                value={organizerName}
                onChange={(event) => setOrganizerName(event.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              />
            </Field>

            <Field label="Expected attendance" htmlFor="activity-attendance">
              <input
                id="activity-attendance"
                type="number"
                min={0}
                value={expectedAttendance}
                onChange={(event) => setExpectedAttendance(event.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary"
              />
            </Field>
          </div>

          {/* SCOPE */}

          <div className="rounded-xl border bg-gray-50 p-4">
            {isAdmin ? (
              <ScopePicker
                idPrefix="activity-create"
                value={adminScope}
                onChange={setAdminScope}
                label="Activity scope"
                hint="Admin may create an activity at any level. It becomes visible to that scope and everything below it."
              />
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Activity scope
                </p>

                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {ownScopeLabel}
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  An activity you create belongs to your own scope, so it is
                  visible to your area and everything below it.
                </p>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={creating}
              className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-apc-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-apc-dark disabled:opacity-50"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Activity
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * ACTIVITY CARD
 * ============================================================ */

function ActivityCard({
  activity,
  canManage,
  onStatusChange,
  onDelete,
}: {
  activity: CampaignActivityRecord;
  canManage: boolean;
  onStatusChange: (status: CampaignActivityStatus) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900">{activity.title}</h3>

            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClasses(activity.status)}`}
            >
              {humanize(activity.status)}
            </span>
          </div>

          {activity.description && (
            <p className="mt-1 text-sm leading-6 text-gray-600">
              {activity.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(activity.date)}
            </span>

            {(activity.start_time || activity.end_time) && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {[activity.start_time, activity.end_time]
                  .filter(Boolean)
                  .join(" – ")}
              </span>
            )}

            {activity.venue && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {activity.venue}
              </span>
            )}

            {typeof activity.expected_attendance === "number" && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {activity.expected_attendance} expected
              </span>
            )}

            <span className="rounded-full bg-apc-primary/10 px-2.5 py-0.5 font-medium text-apc-primary">
              {formatScopeType(activity.scope_type)} · {activity.scope_id}
            </span>

            <span className="rounded-full bg-gray-100 px-2.5 py-0.5">
              {activityTypeLabel(activity.activity_type)}
            </span>
          </div>
        </div>

        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <select
              value={activity.status}
              onChange={(event) =>
                void onStatusChange(
                  event.target.value as CampaignActivityStatus,
                )
              }
              aria-label="Activity status"
              className="rounded-lg border px-2 py-1.5 text-xs font-semibold text-gray-600"
            >
              {ACTIVITY_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {humanize(item)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void onDelete()}
              aria-label="Delete activity"
              className="rounded-lg border p-2 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * SMALL PIECES
 * ============================================================ */

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-apc-primary bg-apc-primary/10 text-apc-primary"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-medium text-gray-700"
      >
        {label}
      </label>

      {children}
    </div>
  );
}
