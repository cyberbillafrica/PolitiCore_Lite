"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  deleteCampaignMember,
  updateCampaignMemberProfile,
  updateMemberAccessRole,
  updateMemberMembershipTypes,
} from "@/lib/firebase/campaignMembers";
import { getAllUsers } from "@/lib/firebase/firestore";
import { getAllEnuguLGAs } from "@/lib/firebase/electoral";
import { deriveLgaIdFromWard } from "@/lib/election-scope";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { LGA, MembershipType, Role } from "@/types";

/*
 * ============================================================
 * MEMBER RECORD
 * ============================================================
 *
 * Shape of a `users/{uid}` profile document. `id` is the Firebase Auth
 * uid and is the one field that is never editable.
 */

interface MemberRecord {
  id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  gender?: string;
  ward_id?: string;
  polling_unit_id?: string;
  access_role?: Role;
  membership_types?: MembershipType[];
  points?: number;
  rank?: string;
}

interface EditForm {
  full_name: string;
  email: string;
  phone: string;
  gender: string;
  lgaId: string;
  ward_id: string;
  polling_unit_id: string;
  access_role: Role;
  membership_types: MembershipType[];
}

const ACCESS_ROLES: Role[] = ["member", "election_officer", "admin"];

const MEMBERSHIP_OPTIONS: MembershipType[] = [
  "campaign_member",
  "social_member",
];

/*
 * ============================================================
 * PAGE
 * ============================================================
 */

export default function AdminMembersPage() {
  const { profile, loading: authLoading } = useAuth();

  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [lgas, setLgas] = useState<LGA[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Read filters
  const [search, setSearch] = useState("");
  const [wardFilter, setWardFilter] = useState("");
  const [puFilter, setPuFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // Update state
  const [editing, setEditing] = useState<MemberRecord | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<MemberRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState("");
  const [actionError, setActionError] = useState("");

  const isAdmin = profile?.access_role === "admin";

  /*
   * ----------------------------------------------------------
   * LOAD
   * ----------------------------------------------------------
   */

  const loadMembers = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const data = (await getAllUsers()) as unknown as MemberRecord[];
      setMembers(data);
    } catch (err) {
      console.error("Failed to load members:", err);
      setLoadError("Unable to load members right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!profile || profile.access_role !== "admin") return;

    void loadMembers();

    getAllEnuguLGAs()
      .then((data) => setLgas(data))
      .catch((err: unknown) => {
        console.error("Failed to load the Enugu LGA list:", err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile?.id, profile?.access_role]);

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  /*
   * ----------------------------------------------------------
   * ELECTORAL LABELS
   * ----------------------------------------------------------
   */

  const wardLabels = useMemo(() => {
    const map = new Map<string, string>();

    for (const lga of lgas) {
      for (const ward of lga.wards) {
        map.set(ward.id, `${ward.code} — ${ward.name}`);
      }
    }

    return map;
  }, [lgas]);

  const puLabels = useMemo(() => {
    const map = new Map<string, string>();

    for (const lga of lgas) {
      for (const ward of lga.wards) {
        for (const pu of ward.pollingUnits) {
          map.set(pu.id, `${pu.code} — ${pu.name}`);
        }
      }
    }

    return map;
  }, [lgas]);

  /*
   * ----------------------------------------------------------
   * READ FILTERING
   * ----------------------------------------------------------
   */

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return members.filter((member) => {
      if (term) {
        const haystack = [
          member.full_name,
          member.email,
          member.phone,
          member.ward_id,
          wardLabels.get(member.ward_id ?? ""),
          member.polling_unit_id,
          puLabels.get(member.polling_unit_id ?? ""),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(term)) return false;
      }

      if (wardFilter && member.ward_id !== wardFilter) return false;
      if (puFilter && member.polling_unit_id !== puFilter) return false;
      if (roleFilter && (member.access_role ?? "") !== roleFilter) return false;

      return true;
    });
  }, [members, search, wardFilter, puFilter, roleFilter, wardLabels, puLabels]);

  const wardFilterOptions = useMemo(
    () =>
      Array.from(
        new Set(members.map((member) => member.ward_id).filter(Boolean) as string[]),
      ).sort((a, b) =>
        (wardLabels.get(a) ?? a).localeCompare(wardLabels.get(b) ?? b),
      ),
    [members, wardLabels],
  );

  const puFilterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          members.map((member) => member.polling_unit_id).filter(Boolean) as string[],
        ),
      ).sort((a, b) =>
        (puLabels.get(a) ?? a).localeCompare(puLabels.get(b) ?? b),
      ),
    [members, puLabels],
  );

  /*
   * ----------------------------------------------------------
   * UPDATE
   * ----------------------------------------------------------
   */

  const openEdit = (member: MemberRecord) => {
    setEditing(member);
    setFormError("");
    setActionError("");

    setForm({
      full_name: member.full_name ?? "",
      email: member.email ?? "",
      phone: member.phone ?? "",
      gender: member.gender ?? "",
      lgaId: deriveLgaIdFromWard(lgas, member.ward_id),
      ward_id: member.ward_id ?? "",
      polling_unit_id: member.polling_unit_id ?? "",
      access_role: member.access_role ?? "member",
      membership_types: member.membership_types ?? [],
    });
  };

  const closeEdit = () => {
    setEditing(null);
    setForm(null);
    setFormError("");
  };

  const selectedLga = form
    ? lgas.find((lga) => lga.id === form.lgaId)
    : undefined;
  const editWards = selectedLga?.wards ?? [];
  const selectedWard = form
    ? editWards.find((ward) => ward.id === form.ward_id)
    : undefined;
  const editPollingUnits = selectedWard?.pollingUnits ?? [];

  const toggleMembership = (type: MembershipType) => {
    setForm((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        membership_types: prev.membership_types.includes(type)
          ? prev.membership_types.filter((item) => item !== type)
          : [...prev.membership_types, type],
      };
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!editing || !form) return;

    setSaving(true);
    setFormError("");

    const fullName = form.full_name.trim();

    try {
      /*
       * Profile fields. `user_id` / `id` are never sent — the document
       * id IS the member's uid and updateCampaignMemberProfile strips
       * the identifiers defensively as well.
       */
      await updateCampaignMemberProfile(editing.id, {
        full_name: fullName,
        email: form.email.trim(),
        phone: form.phone.trim(),
        gender: form.gender,
        ward_id: form.ward_id,
        polling_unit_id: form.polling_unit_id,
      });

      if ((editing.access_role ?? "member") !== form.access_role) {
        await updateMemberAccessRole(editing.id, form.access_role);
      }

      const previousMemberships = [...(editing.membership_types ?? [])].sort();
      const nextMemberships = [...form.membership_types].sort();

      if (previousMemberships.join("|") !== nextMemberships.join("|")) {
        await updateMemberMembershipTypes(editing.id, form.membership_types);
      }

      // Reflect the Firestore write in local state immediately.
      setMembers((prev) =>
        prev.map((member) =>
          member.id === editing.id
            ? {
                ...member,
                full_name: fullName,
                email: form.email.trim(),
                phone: form.phone.trim(),
                gender: form.gender,
                ward_id: form.ward_id,
                polling_unit_id: form.polling_unit_id,
                access_role: form.access_role,
                membership_types: form.membership_types,
              }
            : member,
        ),
      );

      setToast(`${fullName || "Member"} updated.`);
      closeEdit();
    } catch (err) {
      console.error("Failed to update member:", err);
      setFormError(
        err instanceof Error
          ? err.message
          : "Unable to save this member right now.",
      );
    } finally {
      setSaving(false);
    }
  };

  /*
   * ----------------------------------------------------------
   * DELETE
   * ----------------------------------------------------------
   */

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setActionError("");

    try {
      await deleteCampaignMember(deleteTarget.id);

      setMembers((prev) =>
        prev.filter((member) => member.id !== deleteTarget.id),
      );

      setToast(`${deleteTarget.full_name || "Member"} deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      console.error("Failed to delete member:", err);
      setActionError(
        err instanceof Error
          ? err.message
          : "Unable to delete this member right now.",
      );
    } finally {
      setDeleting(false);
    }
  };

  /*
   * ----------------------------------------------------------
   * RENDER GUARDS
   * ----------------------------------------------------------
   */

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading members…
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  if (!isAdmin) {
    return (
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="flex gap-4 p-6">
          <ShieldAlert className="h-6 w-6 shrink-0 text-yellow-600" />
          <div>
            <h2 className="font-semibold text-yellow-900">
              Administrators only
            </h2>
            <p className="mt-1 text-sm text-yellow-800">
              Member management is restricted to platform administrators.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Users className="h-6 w-6 text-apc-primary" />
            Members
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Create, review, update and remove platform members across Enugu
            State.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadMembers}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <Link
            href="/portal/admin/members/add"
            className="flex items-center gap-2 rounded-lg bg-apc-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-apc-dark"
          >
            <Plus className="h-4 w-4" />
            Add Member
          </Link>
        </div>
      </div>

      {/* NOTICES */}

      {toast ? (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {toast}
        </div>
      ) : null}

      {actionError ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {actionError}
        </div>
      ) : null}

      {/* FILTERS */}

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, phone…"
                className="w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm outline-none focus:border-apc-primary focus:ring-2 focus:ring-apc-primary/10"
              />
            </div>

            <select
              value={wardFilter}
              onChange={(event) => {
                setWardFilter(event.target.value);
                setPuFilter("");
              }}
              className="w-full rounded-lg border bg-white px-4 py-2.5 text-sm"
            >
              <option value="">All wards</option>
              {wardFilterOptions.map((wardId) => (
                <option key={wardId} value={wardId}>
                  {wardLabels.get(wardId) ?? wardId}
                </option>
              ))}
            </select>

            <select
              value={puFilter}
              onChange={(event) => setPuFilter(event.target.value)}
              className="w-full rounded-lg border bg-white px-4 py-2.5 text-sm"
            >
              <option value="">All polling units</option>
              {puFilterOptions.map((puId) => (
                <option key={puId} value={puId}>
                  {puLabels.get(puId) ?? puId}
                </option>
              ))}
            </select>

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="w-full rounded-lg border bg-white px-4 py-2.5 text-sm"
            >
              <option value="">All access roles</option>
              {ACCESS_ROLES.map((role) => (
                <option key={role} value={role}>
                  {formatRole(role)}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* TABLE */}

      <Card>
        <CardHeader>
          <CardTitle>
            All Members ({loading ? "…" : filteredMembers.length})
          </CardTitle>
        </CardHeader>

        <CardContent>
          {loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading members…
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-4 font-semibold text-gray-900">
                No members match your filters
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Adjust the search or filters, or add a new member.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Ward / Polling Unit</th>
                    <th className="px-4 py-3">Role &amp; Membership</th>
                    <th className="px-4 py-3 text-right">Points</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">
                          {member.full_name || "Member"}
                        </p>
                        <p className="text-xs text-gray-400">
                          {member.gender || "—"}
                        </p>
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        <p className="truncate">{member.email || "—"}</p>
                        <p className="text-xs text-gray-400">
                          {member.phone || "—"}
                        </p>
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        <p>
                          {member.ward_id
                            ? wardLabels.get(member.ward_id) ?? member.ward_id
                            : "—"}
                        </p>
                        <p className="text-xs text-gray-400">
                          {member.polling_unit_id
                            ? puLabels.get(member.polling_unit_id) ??
                              member.polling_unit_id
                            : "—"}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <span className="inline-block rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                            {formatRole(member.access_role ?? "member")}
                          </span>

                          {(member.membership_types ?? []).map((type) => (
                            <span
                              key={type}
                              className="inline-block rounded bg-apc-light px-2 py-0.5 text-xs font-medium text-apc-primary"
                            >
                              {formatMembership(type)}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-gray-800">
                        {member.points ?? 0}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/portal/campaign/members/${member.id}`}
                            title="View full profile"
                            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>

                          <button
                            type="button"
                            onClick={() => openEdit(member)}
                            title="Edit member"
                            className="rounded-lg p-2 text-apc-primary transition-colors hover:bg-apc-light"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActionError("");
                              setDeleteTarget(member);
                            }}
                            title="Delete member"
                            className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* EDIT MODAL */}

      {editing && form ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <form
            onSubmit={handleSave}
            className="my-8 w-full max-w-3xl space-y-6 rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Edit Member
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  User ID {editing.id} (immutable)
                </p>
              </div>

              <button
                type="button"
                onClick={closeEdit}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Full Name
                </label>
                <input
                  required
                  value={form.full_name}
                  onChange={(event) =>
                    setForm({ ...form, full_name: event.target.value })
                  }
                  className="w-full rounded-lg border px-4 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  className="w-full rounded-lg border px-4 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Phone</label>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  className="w-full rounded-lg border px-4 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Gender</label>
                <select
                  value={form.gender}
                  onChange={(event) =>
                    setForm({ ...form, gender: event.target.value })
                  }
                  className="w-full rounded-lg border bg-white px-4 py-2.5 text-sm"
                >
                  <option value="">Not specified</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">LGA</label>
                <select
                  value={form.lgaId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      lgaId: event.target.value,
                      ward_id: "",
                      polling_unit_id: "",
                    })
                  }
                  className="w-full rounded-lg border bg-white px-4 py-2.5 text-sm"
                >
                  <option value="">Select LGA</option>
                  {lgas.map((lga) => (
                    <option key={lga.id} value={lga.id}>
                      {lga.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Ward</label>
                <select
                  value={form.ward_id}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      ward_id: event.target.value,
                      polling_unit_id: "",
                    })
                  }
                  disabled={!form.lgaId && !form.ward_id}
                  className="w-full rounded-lg border bg-white px-4 py-2.5 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">
                    {form.lgaId || form.ward_id ? "Select ward" : "Select an LGA first"}
                  </option>

                  {form.ward_id &&
                  !editWards.some((ward) => ward.id === form.ward_id) ? (
                    <option value={form.ward_id}>
                      {wardLabels.get(form.ward_id) ?? form.ward_id}
                    </option>
                  ) : null}

                  {editWards.map((ward) => (
                    <option key={ward.id} value={ward.id}>
                      {ward.code} — {ward.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Polling Unit
                </label>
                <select
                  value={form.polling_unit_id}
                  onChange={(event) =>
                    setForm({ ...form, polling_unit_id: event.target.value })
                  }
                  disabled={!form.ward_id}
                  className="w-full rounded-lg border bg-white px-4 py-2.5 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">
                    {form.ward_id ? "Select polling unit" : "Select a ward first"}
                  </option>

                  {form.polling_unit_id &&
                  !editPollingUnits.some(
                    (pu) => pu.id === form.polling_unit_id,
                  ) ? (
                    <option value={form.polling_unit_id}>
                      {puLabels.get(form.polling_unit_id) ??
                        form.polling_unit_id}
                    </option>
                  ) : null}

                  {editPollingUnits.map((pu) => (
                    <option key={pu.id} value={pu.id}>
                      {pu.code} — {pu.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Access Role
                </label>
                <select
                  value={form.access_role}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      access_role: event.target.value as Role,
                    })
                  }
                  className="w-full rounded-lg border bg-white px-4 py-2.5 text-sm"
                >
                  {ACCESS_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {formatRole(role)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium">Membership Types</p>
              <div className="flex flex-wrap gap-4">
                {MEMBERSHIP_OPTIONS.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.membership_types.includes(type)}
                      onChange={() => toggleMembership(type)}
                      className="rounded border-gray-300 text-apc-primary focus:ring-apc-primary"
                    />
                    {formatMembership(type)}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t pt-5">
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-apc-primary px-5 py-2 text-sm font-semibold text-white hover:bg-apc-dark disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* DELETE CONFIRM MODAL */}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <Trash2 className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold text-gray-900">Delete member?</h2>
                <p className="mt-1 text-sm text-gray-600">
                  This permanently removes the profile record for{" "}
                  <strong>{deleteTarget.full_name || deleteTarget.id}</strong>.
                  The member&apos;s sign-in account is not removed.
                </p>
              </div>
            </div>

            {actionError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {actionError}
              </div>
            ) : null}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {deleting ? "Deleting…" : "Delete Member"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/*
 * ============================================================
 * FORMATTERS
 * ============================================================
 */

function formatRole(role: Role) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMembership(membership: MembershipType) {
  return membership
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
