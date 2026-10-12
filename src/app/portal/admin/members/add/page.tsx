"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createMemberByAdmin } from "@/lib/firebase/auth";
import { getAllEnuguLGAs } from "@/lib/firebase/electoral";
import { useActiveContest } from "@/hooks/useElectionEngine";
import {
  contestCoversPollingUnit,
  describeContestScope,
  lgasWithinContestScope,
} from "@/lib/election-scope";
import { useAuth } from "@/contexts/AuthContext";
import type { LGA, MembershipType, Role } from "@/types";

export default function AddMemberPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && profile && profile.access_role !== "admin") {
      router.replace("/portal/dashboard");
    }
  }, [authLoading, profile, router]);

  const [form, setForm] = useState<{
    full_name: string;
    email: string;
    password: string;
    phone: string;
    ward_id: string;
    polling_unit_id: string;
    membership_types: MembershipType[];
    access_role: Role;
    facebook_username: string;
    x_username: string;
    instagram_username: string;
    tiktok_username: string;
    gender: string;
  }>({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    ward_id: "",
    polling_unit_id: "",
    membership_types: ["campaign_member"],
    access_role: "member",
    facebook_username: "",
    x_username: "",
    instagram_username: "",
    tiktok_username: "",
    gender: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /*
   * Geographic scope comes from the ACTIVE CONTEST, never from a
   * hardcoded LGA. See src/lib/election-scope.ts for the scope model.
   */
  const { contest } = useActiveContest();

  const [allLgas, setAllLgas] = useState<LGA[]>([]);
  const [selectedLgaId, setSelectedLgaId] = useState("");

  useEffect(() => {
    let cancelled = false;

    getAllEnuguLGAs()
      .then((data) => {
        if (!cancelled) setAllLgas(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load the Enugu State LGA list:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Only LGAs inside the active contest's scope may be chosen.
  const scopedLgas = lgasWithinContestScope(contest, allLgas);

  /*
   * Keep the selected LGA valid as the LGA list or the contest scope
   * changes. A single-LGA scope needs no manual choice, so it is
   * preselected; an out-of-scope choice is cleared instead of being
   * submitted silently.
   */
  useEffect(() => {
    if (allLgas.length === 0) return;

    const allowed = lgasWithinContestScope(contest, allLgas);

    if (
      selectedLgaId !== "" &&
      allowed.some((lga) => lga.id === selectedLgaId)
    ) {
      return;
    }

    const nextLgaId = allowed.length === 1 ? allowed[0].id : "";

    if (nextLgaId === selectedLgaId) return;

    /* eslint-disable react-hooks/set-state-in-effect */
    setSelectedLgaId(nextLgaId);
    setForm((prev) => ({ ...prev, ward_id: "", polling_unit_id: "" }));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [allLgas, contest, selectedLgaId]);

  const selectedLga = scopedLgas.find((lga) => lga.id === selectedLgaId);
  const wards = selectedLga?.wards ?? [];

  const selectedWard = wards.find((ward) => ward.id === form.ward_id);
  const pollingUnits = selectedWard?.pollingUnits ?? [];

  const handleRoleToggle = (type: MembershipType) => {
    setForm((prev) => ({
      ...prev,
      membership_types: prev.membership_types.includes(type)
        ? prev.membership_types.filter((t) => t !== type)
        : [...prev.membership_types, type],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    /*
     * The registration must land inside the active contest's scope.
     * The whole LGA to ward to polling unit chain is checked, so a ward
     * picked from a stale selection cannot slip through.
     */
    if (
      !selectedLgaId ||
      !contestCoversPollingUnit(
        contest,
        selectedLgaId,
        form.ward_id,
        form.polling_unit_id,
        allLgas,
      )
    ) {
      setError(
        `This ward and polling unit are outside the active contest scope (${describeContestScope(
          contest,
          allLgas,
        )}). Choose a location inside that scope.`,
      );
      return;
    }

    setLoading(true);

    const { user, error: createError } = await createMemberByAdmin(
      form.email,
      form.password,
      {
        full_name: form.full_name,
        phone: form.phone,
        gender: form.gender || undefined,

        ward_id: form.ward_id,
        polling_unit_id: form.polling_unit_id,
        lga_id: selectedLgaId || undefined,

        membership_types: form.membership_types,
        access_role: form.access_role,

        /*
         * The profile displays read `*_name` plus the profile URL
         * where collected; keep both so the display and the raw
         * handle stay in sync.
         */
        ...(form.facebook_username ? { facebook_username: form.facebook_username, facebook_name: form.facebook_username } : {}),
        ...(form.x_username ? { x_username: form.x_username, x_name: form.x_username } : {}),
        ...(form.instagram_username ? { instagram_username: form.instagram_username, instagram_name: form.instagram_username } : {}),
        ...(form.tiktok_username ? { tiktok_username: form.tiktok_username, tiktok_name: form.tiktok_username } : {}),
      },
    );

    if (createError) {
      setError(createError);
      setLoading(false);
      return;
    }
    router.push("/portal/admin/members");
  };

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (profile.access_role !== "admin") {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add New Member</h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-6 bg-white rounded-xl shadow p-8"
      >
        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
        )}

        {/*
         * The active contest defines the geographic boundary for this
         * registration. Showing it makes the limited options obvious.
         */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
          <span className="font-semibold uppercase tracking-wide text-slate-500">
            Active contest scope
          </span>
          <p className="mt-1 font-medium">
            {describeContestScope(contest, allLgas)}
          </p>
          <p className="mt-1 text-slate-500">
            Members can only be registered into wards and polling units
            inside this scope.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Full Name *
            </label>
            <input
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full px-4 py-3 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email *</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-3 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Password *</label>
            <input
              required
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-3 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Phone *</label>
            <input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-4 py-3 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">LGA *</label>
            <select
              required
              value={selectedLgaId}
              onChange={(e) => {
                setSelectedLgaId(e.target.value);
                setForm((prev) => ({
                  ...prev,
                  ward_id: "",
                  polling_unit_id: "",
                }));
              }}
              className="w-full px-4 py-3 border rounded-lg"
            >
              <option value="">Select LGA</option>
              {scopedLgas.map((lga) => (
                <option key={lga.id} value={lga.id}>
                  {lga.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Ward *</label>
            <select
              required
              value={form.ward_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  ward_id: e.target.value,
                  polling_unit_id: "",
                })
              }
              disabled={!selectedLgaId}
              className="w-full px-4 py-3 border rounded-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">
                {selectedLgaId ? "Select ward" : "Select an LGA first"}
              </option>
              {wards.map((ward) => (
                <option key={ward.id} value={ward.id}>
                  {ward.code} — {ward.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Polling Unit *
            </label>
            <select
              required
              value={form.polling_unit_id}
              onChange={(e) =>
                setForm({ ...form, polling_unit_id: e.target.value })
              }
              disabled={!form.ward_id}
              className="w-full px-4 py-3 border rounded-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">
                {form.ward_id ? "Select polling unit" : "Select a ward first"}
              </option>
              {pollingUnits.map((pu) => (
                <option key={pu.id} value={pu.id}>
                  {pu.code} — {pu.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Gender</label>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className="w-full px-4 py-3 border rounded-lg"
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-3">Membership</label>
          <div className="flex flex-wrap gap-4">
            {(["campaign_member", "social_member"] as const).map((type) => (
              <label key={type} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={form.membership_types.includes(type)}
                  onChange={() => handleRoleToggle(type)}
                  className="rounded border-gray-300 text-apc-primary focus:ring-apc-primary"
                />
                <span className="capitalize">{type.replace("_", " ")}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Access Role</label>
          <select
            value={form.access_role}
            onChange={(e) =>
              setForm({ ...form, access_role: e.target.value as Role })
            }
            className="w-full px-4 py-3 border rounded-lg"
          >
            <option value="member">Member</option>
            <option value="election_officer">Election Officer</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {form.membership_types.includes("social_member") && (
          <div className="border-t pt-6">
            <h3 className="font-semibold mb-4">
              Social Media (required for social members)
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Facebook Username *
                </label>
                <input
                  required
                  value={form.facebook_username}
                  onChange={(e) =>
                    setForm({ ...form, facebook_username: e.target.value })
                  }
                  className="w-full px-4 py-3 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  X Username *
                </label>
                <input
                  required
                  value={form.x_username}
                  onChange={(e) =>
                    setForm({ ...form, x_username: e.target.value })
                  }
                  className="w-full px-4 py-3 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Instagram
                </label>
                <input
                  value={form.instagram_username}
                  onChange={(e) =>
                    setForm({ ...form, instagram_username: e.target.value })
                  }
                  className="w-full px-4 py-3 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">TikTok</label>
                <input
                  value={form.tiktok_username}
                  onChange={(e) =>
                    setForm({ ...form, tiktok_username: e.target.value })
                  }
                  className="w-full px-4 py-3 border rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-apc-primary text-white py-3 rounded-lg font-semibold hover:bg-apc-dark disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Member"}
        </button>
      </form>
    </div>
  );
}

