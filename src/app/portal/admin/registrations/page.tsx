"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useElectoralLookup } from "@/hooks/useElectoralLookup";
import { notify } from "@/lib/notify";
import { approveRegistration } from "@/lib/firebase/userAccess";
import {
  notifyRegistrationApproved,
  rejectRegistration,
  reopenRegistration,
  subscribeRegistrations,
  type RegistrationRecord,
} from "@/lib/firebase/registrations";

import type { MembershipType, Role } from "@/types";

/*
 * ============================================================
 * ADMIN — REGISTRATION REVIEW (Round 17)
 * ============================================================
 *
 * Public signups land here as `status: "pending"` with NO campaign
 * grants. An admin reviews the captured data, may correct the fields the
 * applicant is allowed to have corrected, then:
 *
 *   Approve  → status "active" + the 9 baseline grants, in ONE batch
 *   Reject   → status "rejected", profile kept (soft delete)
 *   Reopen   → back to "pending" for a fresh review
 *
 * The email address is never editable: changing it is an Auth-level
 * operation, not a profile edit.
 *
 * KNOWN LIMITATION (deferred, see the Round 17 report): `/users/{uid}`
 * reads are `isSignedIn()`, so any signed-in user can read a pending
 * profile. This queue relies on that; a future round can restrict reads
 * to admin + self + active.
 */

type ReviewTab = "pending" | "rejected";

interface EditState {
  full_name: string;
  phone: string;
  gender: string;
  lga_id: string;
  ward_id: string;
  polling_unit_id: string;
  membership_types: MembershipType[];
  access_role: Role;
}

const EMPTY_EDITS: EditState = {
  full_name: "",
  phone: "",
  gender: "",
  lga_id: "",
  ward_id: "",
  polling_unit_id: "",
  membership_types: [],
  access_role: "member",
};

function toEdits(row: RegistrationRecord): EditState {
  return {
    full_name: row.full_name ?? "",
    phone: row.phone ?? "",
    gender: row.gender ?? "",
    lga_id: row.lga_id ?? "",
    ward_id: row.ward_id ?? "",
    polling_unit_id: row.polling_unit_id ?? "",
    membership_types: (row.membership_types as MembershipType[]) ?? [],
    access_role: (row.access_role as Role) ?? "member",
  };
}

function formatDate(value: unknown): string {
  if (!value) return "—";

  const date =
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
      ? (value as { toDate: () => Date }).toDate()
      : value instanceof Date
        ? value
        : null;

  if (!date) return "—";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function RegistrationsPage() {
  const { profile } = useAuth();
  const lookup = useElectoralLookup();

  const [tab, setTab] = useState<ReviewTab>("pending");
  const [rows, setRows] = useState<RegistrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RegistrationRecord | null>(null);
  const [edits, setEdits] = useState<EditState>(EMPTY_EDITS);
  const [saving, setSaving] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RegistrationRecord | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reopeningId, setReopeningId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);

    const unsubscribe = subscribeRegistrations(tab, (next) => {
      setRows(next);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tab]);

  const wards = useMemo(() => {
    const lga = lookup.lgas.find((item) => item.id === edits.lga_id);
    return lga?.wards ?? [];
  }, [lookup.lgas, edits.lga_id]);

  const pollingUnits = useMemo(() => {
    const ward = wards.find((item) => item.id === edits.ward_id);
    return ward?.pollingUnits ?? [];
  }, [wards, edits.ward_id]);

  const openRow = (row: RegistrationRecord) => {
    setSelected(row);
    setEdits(toEdits(row));
  };

  const closeRow = () => {
    if (saving) return;
    setSelected(null);
    setEdits(EMPTY_EDITS);
  };

  const toggleMembership = (type: MembershipType) => {
    setEdits((prev) => ({
      ...prev,
      membership_types: prev.membership_types.includes(type)
        ? prev.membership_types.filter((item) => item !== type)
        : [...prev.membership_types, type],
    }));
  };

  const handleApprove = async () => {
    if (!selected || !profile?.id) return;

    if (!edits.full_name.trim()) {
      notify.error("A full name is required before approval.");
      return;
    }

    setSaving(true);

    /*
     * One atomic batch: corrected profile + status "active" + the 9
     * baseline `user_access` documents. On failure NOTHING was written,
     * so the admin can simply retry.
     */
    const result = await approveRegistration(
      selected.id,
      {
        full_name: edits.full_name.trim(),
        phone: edits.phone.trim(),
        gender: edits.gender,
        lga_id: edits.lga_id,
        ward_id: edits.ward_id,
        polling_unit_id: edits.polling_unit_id,
        membership_types: edits.membership_types,
        access_role: edits.access_role,
      },
      { actorId: profile.id },
    );

    setSaving(false);

    if (result.error || result.skipped) {
      notify.error("Approval failed — no changes were saved. Please retry.");
      return;
    }

    void notifyRegistrationApproved({
      userId: selected.id,
      fullName: edits.full_name,
      actorId: profile.id,
    });

    notify.success(
      result.added > 0
        ? "Registration approved and permissions granted."
        : "Registration approved.",
    );

    closeRow();
  };

  const handleReject = async () => {
    if (!rejectTarget || !profile?.id) return;

    setSaving(true);

    try {
      await rejectRegistration(
        rejectTarget.id,
        rejectReason.trim() || null,
        profile.id,
      );

      notify.success("Registration declined.");
      setRejectTarget(null);
      setRejectReason("");
      setSelected(null);
    } catch (error) {
      console.error("Failed to reject registration:", error);
      notify.error("Could not decline the registration. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async (row: RegistrationRecord) => {
    setReopeningId(row.id);

    try {
      await reopenRegistration(row.id);
      notify.success("Registration returned to the review queue.");
    } catch (error) {
      console.error("Failed to reopen registration:", error);
      notify.error("Could not reopen the registration. Please retry.");
    } finally {
      setReopeningId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/portal/dashboard"
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-apc-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Registrations
            </h1>

            <p className="mt-1 text-sm text-slate-600">
              Review public signups before they can access the portal.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">
            <Users className="h-4 w-4" />
            {tab === "pending" ? "Pending" : "Declined"}: {rows.length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center gap-1 rounded-xl border bg-white p-1 shadow-sm">
        {(["pending", "rejected"] as ReviewTab[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              setSelected(null);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === value
                ? "bg-apc-primary text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {value === "pending" ? "Pending" : "Declined"}
          </button>
        ))}
      </div>

      {/* Queue */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading registrations…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <UserCheck className="h-8 w-8 text-slate-300" />
            <p className="font-semibold text-slate-700">
              {tab === "pending"
                ? "No pending registrations."
                : "No declined registrations."}
            </p>
            <p className="max-w-sm text-sm text-slate-500">
              {tab === "pending"
                ? "New signups from the public registration form appear here."
                : "Registrations you decline are kept here so a decision can be reversed."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Ward / PU</th>
                  <th className="px-4 py-3 font-semibold">Membership</th>
                  <th className="px-4 py-3 font-semibold">Registered</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openRow(row)}
                        className="font-semibold text-slate-900 hover:text-apc-primary"
                      >
                        {row.full_name || "Unnamed applicant"}
                      </button>

                      <p className="text-xs text-slate-400">
                        {row.gender || "—"} ·{" "}
                        {(row.membership_types ?? []).join(", ") || "—"}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-slate-600">{row.email || "—"}</td>

                    <td className="px-4 py-3 text-slate-600">
                      {lookup.wardLabel(row.ward_id)}
                      <p className="text-xs text-slate-400">
                        {lookup.pollingUnitLabel(row.ward_id, row.polling_unit_id)}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {row.access_role ?? "member"}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(row.created_at)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openRow(row)}
                          className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-apc-primary/40 hover:text-apc-primary"
                        >
                          Review
                        </button>

                        {tab === "rejected" && (
                          <button
                            type="button"
                            onClick={() => handleReopen(row)}
                            disabled={reopeningId === row.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                          >
                            {reopeningId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Reopen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail / edit modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-3xl space-y-5 rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {selected.full_name || "Registration"}
                </h2>

                <p className="text-sm text-slate-500">
                  Registered {formatDate(selected.created_at)}
                </p>
              </div>

              <button
                type="button"
                onClick={closeRow}
                disabled={saving}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                aria-label="Close"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {/* Read-only identity */}
            <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2 text-slate-700">
                <Mail className="h-4 w-4 text-slate-400" />
                {selected.email || "—"}
                <span className="text-xs font-semibold uppercase text-slate-400">
                  (locked)
                </span>
              </p>

              <p className="flex items-center gap-2 text-slate-700">
                <Phone className="h-4 w-4 text-slate-400" />
                {selected.phone || "—"}
              </p>

              <p className="flex items-center gap-2 text-slate-700 sm:col-span-2">
                <MapPin className="h-4 w-4 text-slate-400" />
                {lookup.lgaLabel(selected.lga_id, selected.ward_id)} ·{" "}
                {lookup.wardLabel(selected.ward_id)} ·{" "}
                {lookup.pollingUnitLabel(
                  selected.ward_id,
                  selected.polling_unit_id,
                )}
              </p>
            </div>

            {/* Social handles captured at signup */}
            {[
              ["Facebook", selected.facebook_name, selected.facebook_profile_url],
              ["X", selected.x_name, selected.x_profile_url],
              ["Instagram", selected.instagram_name, selected.instagram_profile_url],
              ["TikTok", selected.tiktok_name, selected.tiktok_profile_url],
            ].some(([, name, url]) => name || url) && (
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {[
                  ["Facebook", selected.facebook_name, selected.facebook_profile_url],
                  ["X", selected.x_name, selected.x_profile_url],
                  ["Instagram", selected.instagram_name, selected.instagram_profile_url],
                  ["TikTok", selected.tiktok_name, selected.tiktok_profile_url],
                ]
                  .filter(([, name, url]) => name || url)
                  .map(([label, name, url]) => (
                    <p key={label} className="text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {label}:
                      </span>{" "}
                      {name || "—"}
                      {url ? (
                        <a
                          href={String(url)}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 text-apc-primary hover:underline"
                        >
                          profile
                        </a>
                      ) : null}
                    </p>
                  ))}
              </div>
            )}

            {/* Editable fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <input
                  value={edits.full_name}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, full_name: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Phone">
                <input
                  value={edits.phone}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Gender">
                <select
                  value={edits.gender}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, gender: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </Field>

              <Field label="Access role">
                <select
                  value={edits.access_role}
                  onChange={(e) =>
                    setEdits((prev) => ({
                      ...prev,
                      access_role: e.target.value as Role,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="member">Member</option>
                  <option value="election_officer">Election officer</option>
                  <option value="admin">Administrator</option>
                </select>
              </Field>

              <Field label="LGA">
                <select
                  value={edits.lga_id}
                  onChange={(e) =>
                    setEdits((prev) => ({
                      ...prev,
                      lga_id: e.target.value,
                      ward_id: "",
                      polling_unit_id: "",
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {lookup.lgas.map((lga) => (
                    <option key={lga.id} value={lga.id}>
                      {lga.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Ward">
                <select
                  value={edits.ward_id}
                  onChange={(e) =>
                    setEdits((prev) => ({
                      ...prev,
                      ward_id: e.target.value,
                      polling_unit_id: "",
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {wards.map((ward) => (
                    <option key={ward.id} value={ward.id}>
                      {ward.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Polling unit">
                <select
                  value={edits.polling_unit_id}
                  onChange={(e) =>
                    setEdits((prev) => ({
                      ...prev,
                      polling_unit_id: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {pollingUnits.map((pu) => (
                    <option key={pu.id} value={pu.id}>
                      {pu.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Membership types">
                <div className="flex flex-wrap gap-3 pt-1 text-sm">
                  {(["campaign_member", "social_member"] as MembershipType[]).map(
                    (type) => (
                      <label key={type} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={edits.membership_types.includes(type)}
                          onChange={() => toggleMembership(type)}
                        />
                        {type === "campaign_member" ? "Campaign" : "Social"}
                      </label>
                    ),
                  )}
                </div>
              </Field>
            </div>

            {tab === "rejected" && selected.rejection_reason && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <strong>Declined:</strong> {selected.rejection_reason}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(selected);
                  setRejectReason("");
                }}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                {tab === "pending" ? "Decline" : "Decline again"}
              </button>

              <button
                type="button"
                onClick={handleApprove}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-apc-primary px-4 py-2 text-sm font-semibold text-white hover:bg-apc-dark disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {saving ? "Saving…" : "Approve registration"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {rejectTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              Decline this registration?
            </h2>

            <p className="text-sm text-slate-600">
              {rejectTarget.full_name || "This applicant"} will not be able to
              sign in. The profile is kept, so the decision can be reversed from
              the Declined tab.
            </p>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Optional reason (kept for the audit trail)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                disabled={saving}
                className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleReject}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Decline registration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
