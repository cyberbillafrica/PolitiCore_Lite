"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { submitElectionResult } from "@/lib/firebase/firestore";
import { parties } from "@/lib/utils";
import { nkanuWestElectoralData } from "@/data/electoral";
import { getWardById, getPollingUnitById } from "@/lib/constants";

export default function ElectionUploadPage() {
  const { profile } = useAuth();
  const isAdminOrElectionOfficer =
    profile?.access_role === "admin" ||
    profile?.access_role === "election_officer";

  const [form, setForm] = useState({
    ward_id: isAdminOrElectionOfficer ? "" : (profile?.ward_id ?? ""),
    polling_unit_id: isAdminOrElectionOfficer
      ? ""
      : (profile?.polling_unit_id ?? ""),
    results: parties.map((p) => ({ party: p.id, votes: 0 })),
  });

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedWard = nkanuWestElectoralData.find(
    (ward) => ward.id === form.ward_id,
  );
  const pollingUnits = selectedWard?.pollingUnits ?? [];

  // Resolved names for the read-only "Your Reporting Area" box (members only).
  const memberWard = getWardById(profile?.ward_id ?? "");
  const memberPollingUnit = getPollingUnitById(
    profile?.ward_id ?? "",
    profile?.polling_unit_id ?? "",
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!form.ward_id || !form.polling_unit_id) {
      setError("Ward and polling unit are required.");
      return;
    }

    // Non‑privileged users can only submit for their own registered ward/PU
    if (!isAdminOrElectionOfficer) {
      if (
        form.ward_id !== profile?.ward_id ||
        form.polling_unit_id !== profile?.polling_unit_id
      ) {
        setError(
          "You can only submit results for your registered ward and polling unit.",
        );
        return;
      }
    }

    const nonZeroResults = form.results.filter((r) => r.votes > 0);
    if (nonZeroResults.length === 0) {
      setError("Please enter at least one party vote.");
      return;
    }

    setSubmitting(true);
    try {
      await submitElectionResult(
        form.polling_unit_id,
        form.ward_id,
        nonZeroResults,
        profile?.id || "unknown",
      );
      setMessage(
        "Results submitted successfully! They will be reviewed shortly.",
      );
    } catch (err: any) {
      setError(err.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Upload Election Results
      </h1>

      {!isAdminOrElectionOfficer && (
        <div className="mb-6 p-4 bg-apc-light text-apc-primary rounded-lg border border-apc-primary/20">
          <p className="font-medium">Your Reporting Area</p>
          <p className="mt-1">
            <span className="font-semibold">Ward:</span>{" "}
            {memberWard ? `${memberWard.code} — ${memberWard.name}` : "Not set"}
          </p>
          <p>
            <span className="font-semibold">Polling Unit:</span>{" "}
            {memberPollingUnit
              ? `${memberPollingUnit.code} — ${memberPollingUnit.name}`
              : "Not set"}
          </p>
          <p className="text-sm mt-2 text-gray-600">
            You can only submit results for this area.
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-sm p-8 space-y-6"
      >
        {/* Ward and Polling Unit – admin/election officer only */}
        {isAdminOrElectionOfficer && (
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ward *
              </label>
              <select
                value={form.ward_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    ward_id: e.target.value,
                    polling_unit_id: "",
                  })
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apc-primary focus:border-transparent"
                required
              >
                <option value="">Select ward</option>
                {nkanuWestElectoralData.map((ward) => (
                  <option key={ward.id} value={ward.id}>
                    {ward.code} — {ward.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Polling Unit *
              </label>
              <select
                value={form.polling_unit_id}
                onChange={(e) =>
                  setForm({ ...form, polling_unit_id: e.target.value })
                }
                disabled={!form.ward_id}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apc-primary focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
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
          </div>
        )}

        {/* Party votes */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-apc-primary mb-4">
            Enter Votes per Party
          </h3>
          <div className="space-y-4">
            {parties.map((party, idx) => (
              <div key={party.id}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {party.name} Votes
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.results[idx].votes}
                  onChange={(e) => {
                    const newResults = [...form.results];
                    newResults[idx].votes = parseInt(e.target.value) || 0;
                    setForm({ ...form, results: newResults });
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apc-primary focus:border-transparent"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-600 text-sm">{message}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-apc-primary text-white py-3 rounded-lg font-semibold hover:bg-apc-dark transition-colors disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Results"}
        </button>
      </form>
    </div>
  );
}

