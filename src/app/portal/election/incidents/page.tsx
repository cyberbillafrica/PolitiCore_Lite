"use client";


import { notify } from "@/lib/notify";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  createElectionIncident,
  subscribeToElectionIncidents,
  type ElectionIncidentDoc,
} from "@/lib/firebase/election";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { getAllEnuguLGAs } from "@/lib/firebase/electoral";
import { deriveLgaIdFromWard, lgasWithinContestScope, contestCoversWard, describeContestScope, pollingUnitDisplayLabel, wardDisplayLabel } from "@/lib/election-scope";
import { buildElectionReadScope, registeredPollingUnitConstraint } from "@/lib/election-read-scope";
import { useElectionMode, useActiveContest } from "@/hooks/useElectionEngine";
import BackToDashboardLink from "@/components/election/BackToDashboardLink";
import { NO_ACTIVE_CONTEST_MESSAGE, type ElectionIncidentScopeConstraint } from "@/lib/firebase/election";
import { resolveUserNames, UNKNOWN_MEMBER_NAME } from "@/lib/userNames";
import type { LGA } from "@/types";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Upload,
  X,
  ShieldAlert,
} from "lucide-react";

export default function IncidentsPage() {
  const { profile, assignments, accessLoading } = useAuth();
  const { electionMode, loading: electionModeLoading } = useElectionMode();
  const isAdmin = profile?.access_role === "admin";
  const isElectionOfficer = profile?.access_role === "election_officer";

  /*
   * Round-5 submission ownership: admins and election officers report
   * from ANYWHERE within the active contest's scope; every other role
   * is locked to its registered ward — and, when a PU is attached, to
   * its own registered polling unit. The rule enforces this too.
   */
  const canReportAnywhere = isAdmin || isElectionOfficer;
  const hasRegisteredWard = Boolean(profile?.ward_id);
  const locationLocked = !canReportAnywhere;
  const lockMessage = hasRegisteredWard
    ? "Locked to your registered ward — polling-unit incidents take your registered PU."
    : "Your profile has no registered ward. Ask an administrator to set your ward before reporting.";

  /*
   * Round-4: the active contest scopes EVERY submission — admins and
   * officers included. With no active contest reporting is disabled.
   */
  const { contest: activeContest, loading: contestLoading } =
    useActiveContest();

  const [lgas, setLgas] = useState<LGA[]>([]);
  const [incidents, setIncidents] = useState<ElectionIncidentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMessage] = useState("");

  /*
   * No LGA is assumed. The LGA is the reporter's registered LGA (or the
   * LGA owning their registered ward) and is resolved once the Enugu
   * State LGA list has loaded.
   */
  const [form, setForm] = useState({
    lga_id: "",
    ward_id: profile?.ward_id ?? "",
    polling_unit_id: profile?.polling_unit_id ?? "",
    incident_type: "bavas_malfunction" as ElectionIncidentDoc["incident_type"],
    severity: "medium" as ElectionIncidentDoc["severity"],
    description: "",
  });

  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);

  /*
   * Batch-resolved reporter display names — one lookup per snapshot,
   * never a per-row fetch (see src/lib/userNames.ts). Missing
   * profiles render "Unknown member", not a raw doc id.
   */
  const [userNames, setUserNames] = useState<Map<string, string>>(
    () => new Map(),
  );

  // Load the state-wide LGA list
  useEffect(() => {
    async function loadLgas() {
      const data = await getAllEnuguLGAs();
      setLgas(data);
    }
    loadLgas();
  }, []);

  /*
   * The LGA selector is constrained to the ACTIVE CONTEST's scope
   * (see src/lib/election-scope.ts).
   */
  const { contest: incidentActiveContest } = useActiveContest();
  const scopedLgaOptions = lgasWithinContestScope(
    incidentActiveContest,
    lgas,
  );

  const resolvedLgaId = deriveLgaIdFromWard(lgas, profile?.ward_id);

  /*
   * Place the reporter in their own LGA once the list is known. Only
   * fills an empty value, so an explicit choice is never overwritten.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!resolvedLgaId) return;

    setForm((prev) =>
      prev.lga_id ? prev : { ...prev, lga_id: resolvedLgaId },
    );
  }, [resolvedLgaId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /*
   * Real-time Incidents Listener.
   *
   * Each listener carries an equality filter the
   * `election_incidents` read rule can prove in advance (own
   * reports, or ward / PU reads backed by the caller's
   * `user_access` projection), so members no longer trigger a
   * collection-wide query the rules reject.
   */
  useEffect(() => {
    if (accessLoading || !profile) {
      return;
    }

    const scope = buildElectionReadScope(profile, assignments, lgas);

    const constraints: ElectionIncidentScopeConstraint[] = [];

    if (!scope.unrestricted) {
      constraints.push(...scope.geoConstraints);

      /*
       * A member always sees PU-level incidents at the polling unit
       * they are registered at (registeredAt() read grant), plus
       * their own reports.
       */
      const registered = registeredPollingUnitConstraint(profile);
      if (registered) {
        constraints.push(registered);
      }

      // A member always reads their own reports.
      if (profile.id) {
        constraints.push({ reported_by: profile.id });
      }
    }

    if (!scope.unrestricted && constraints.length === 0) {
      // Nothing is provably readable — open no listener at all.
      setIncidents([]);
      setLoading(false);
      return;
    }

    const [primary, ...additional] = constraints;

    const unsubscribe = subscribeToElectionIncidents(
      (docs) => {
        setIncidents(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load election incidents:", err);
        setLoadError(
          "Election incidents could not be loaded. Please try again.",
        );
        setLoading(false);
      },
      primary,
      additional,
    );

    return () => unsubscribe();
  }, [accessLoading, profile, assignments, lgas]);

  const selectedLga = lgas.find((l) => l.id === form.lga_id);
  const wards = selectedLga?.wards ?? [];
  const selectedWard = wards.find((w) => w.id === form.ward_id);
  const pollingUnits = selectedWard?.pollingUnits ?? [];

  /*
   * No client-side scope filter: the queries above already return
   * exactly what this account is allowed to read.
   */
  const filteredIncidents = incidents;

  /*
   * One batched name lookup per snapshot instead of one fetch per row.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const uids = Array.from(
      new Set(incidents.map((i) => i.reported_by)),
    ).filter((uid): uid is string => typeof uid === "string" && uid !== "");

    if (uids.length === 0) return;

    let cancelled = false;
    resolveUserNames(uids).then((resolved) => {
      if (cancelled) return;
      setUserNames((prev) => new Map([...prev, ...resolved]));
    });

    return () => {
      cancelled = true;
    };
  }, [incidents]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEvidenceFile(file);
      setEvidencePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage("");

    if (!electionMode) {
      notify.error(
        "Election mode is currently OFF. Incident reporting is disabled.",
      );
      return;
    }

    if (!activeContest) {
      notify.error(NO_ACTIVE_CONTEST_MESSAGE);
      return;
    }

    if (!form.ward_id) {
      notify.error("Ward is required.");
      return;
    }

    if (!form.description.trim()) {
      notify.error("Incident description is required.");
      return;
    }

    // Round-5 scoping check: only admins and officers report from
    // anywhere — everyone else is locked to their registered location.
    if (!canReportAnywhere) {
      if (form.ward_id !== profile?.ward_id) {
        notify.error(
          "You can only report incidents within your registered Ward.",
        );
        return;
      }

      if (form.polling_unit_id && form.polling_unit_id !== profile?.polling_unit_id) {
        notify.error(
          "You can only attach your registered Polling Unit to a ward incident.",
        );
        return;
      }
    }

    /*
     * Round-4: every role — admin and officer included — may only
     * report inside the active contest's geographic scope. The service
     * re-checks this too (createElectionIncident re-derives the ward's
     * LGA itself), so direct API posts are refused as well.
     */
    if (!contestCoversWard(activeContest, form.lga_id, form.ward_id, lgas)) {
      notify.error(
        "The selected ward is not within the scope of the active contest.",
      );
      return;
    }

    setSubmitting(true);
    try {
      let cloudinaryUrl: string | null = null;
      if (evidenceFile) {
        try {
          cloudinaryUrl = await uploadToCloudinary(
            evidenceFile,
            "ifeanyi-2027/incidents",
          );
        } catch (uploadErr) {
          console.warn("Cloudinary evidence upload fallback:", uploadErr);
        }
      }

      await createElectionIncident({
        ward_id: form.ward_id,
        lga_id: form.lga_id,
        polling_unit_id: form.polling_unit_id || null,
        incident_type: form.incident_type,
        severity: form.severity,
        description: form.description.trim(),
        reported_by: profile?.id || "unknown",
        cloudinary_url: cloudinaryUrl,
      });

      setSuccessMessage("Election incident reported successfully!");
      setShowForm(false);
      setForm({
        lga_id: resolvedLgaId,
        ward_id: profile?.ward_id ?? "",
        polling_unit_id: profile?.polling_unit_id ?? "",
        incident_type: "bavas_malfunction",
        severity: "medium",
        description: "",
      });
      setEvidenceFile(null);
      setEvidencePreview(null);
    } catch (err: any) {
      console.error("Failed to report election incident:", err);
      notify.error(
        err.message || "Failed to report incident. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (accessLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-apc-primary" />
        <span className="ml-3 text-gray-500">Loading incident reports...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <BackToDashboardLink />
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Election Incident Reports
          </h1>
          <p className="text-sm text-gray-500">
            Report and track irregularities, BVAS malfunctions, late arrivals,
            or security incidents.
          </p>
        </div>

        <button
          onClick={() => {
            setShowForm((prev) => !prev);
            setSuccessMessage("");
          }}
          disabled={electionModeLoading || contestLoading || !electionMode || !activeContest}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
        >
          <AlertTriangle className="h-4 w-4" />
          {showForm ? "Cancel" : "Report Incident"}
        </button>
      </div>

      {!electionModeLoading && !electionMode && (
        <div className="flex items-start gap-2 p-4 bg-gray-100 text-gray-700 rounded-lg border border-gray-300 text-sm">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>
            <strong>Election mode is OFF.</strong> Incident reporting is
            disabled until an administrator turns election mode back on.
          </span>
        </div>
      )}

      {!contestLoading && !activeContest && (
        <div className="flex items-start gap-2 p-4 bg-amber-50 text-amber-800 rounded-lg border border-amber-200 text-sm">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>
            <strong>
              No active contest — election operations are unavailable.
            </strong>{" "}
            Incident reporting is disabled until an administrator activates
            a contest.
          </span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <Card className="border-red-200 bg-red-50/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-red-900 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-600" />
                Report Election Incident
              </CardTitle>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Location Selectors */}
              {locationLocked && (
                <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{lockMessage}</span>
                </div>
              )}
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    LGA *
                  </label>
                  <select
                    value={form.lga_id}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        lga_id: e.target.value,
                        ward_id: "",
                        polling_unit_id: "",
                      })
                    }
                    disabled={locationLocked}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white disabled:bg-gray-100"
                    required
                  >
                    <option value="">Select LGA</option>
                    {scopedLgaOptions.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
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
                    disabled={locationLocked || !form.lga_id}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white disabled:bg-gray-100"
                    required
                  >
                    <option value="">
                      {form.lga_id ? "Select ward" : "Select LGA first"}
                    </option>
                    {wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Polling Unit (Optional)
                  </label>
                  <select
                    value={form.polling_unit_id}
                    onChange={(e) =>
                      setForm({ ...form, polling_unit_id: e.target.value })
                    }
                    disabled={locationLocked || !form.ward_id}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white disabled:bg-gray-100"
                  >
                    <option value="">Entire Ward / Select Polling Unit</option>
                    {pollingUnits.map((pu) => (
                      <option key={pu.id} value={pu.id}>
                        {pu.code} — {pu.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Incident Type *
                  </label>
                  <select
                    value={form.incident_type}
                    onChange={(e) =>
                      setForm({ ...form, incident_type: e.target.value as ElectionIncidentDoc["incident_type"] })
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                    required
                  >
                    <option value="bavas_malfunction">
                      BVAS / Technical Failure
                    </option>
                    <option value="late_arrival">
                      Late Arrival of Materials
                    </option>
                    <option value="vote_buying">
                      Vote Buying / Inducement
                    </option>
                    <option value="ballot_snatching">
                      Ballot Snatching / Tampering
                    </option>
                    <option value="violence">
                      Disruption / Security Concern
                    </option>
                    <option value="other">Other Incident</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Severity *
                  </label>
                  <select
                    value={form.severity}
                    onChange={(e) =>
                      setForm({ ...form, severity: e.target.value as ElectionIncidentDoc["severity"] })
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                    required
                  >
                    <option value="low">Low — Minor Delay</option>
                    <option value="medium">Medium — Operational Concern</option>
                    <option value="high">High — Serious Disturbance</option>
                    <option value="critical">
                      Critical — Immediate Intervention Needed
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Incident Description *
                </label>
                <textarea
                  rows={4}
                  required
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Describe the incident in detail..."
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                />
              </div>

              {/* Photo Evidence */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Photo / Video Evidence (Optional)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageChange}
                    className="text-xs text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-red-600 file:text-white"
                  />
                  {evidencePreview && (
                    <img
                      src={evidencePreview}
                      alt="Preview"
                      className="h-12 w-12 object-cover rounded-lg border"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    electionModeLoading ||
                    contestLoading ||
                    !electionMode ||
                    !activeContest ||
                    (locationLocked && !hasRegisteredWard)
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Submit Incident Report</span>
                  )}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Incidents Listing */}
      <Card>
        <CardHeader>
          <CardTitle>Reported Incidents ({filteredIncidents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p className="py-10 text-center text-sm text-red-600">
              {loadError}
            </p>
          ) : filteredIncidents.length === 0 ? (
            <div className="text-center py-10">
              <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                No election incidents reported in this scope.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className="bg-white border rounded-xl p-5 space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
                          inc.severity === "critical" || inc.severity === "high"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {inc.severity} Severity
                      </span>
                      <span className="font-bold text-gray-900 uppercase text-xs">
                        {inc.incident_type.replace("_", " ")}
                      </span>
                    </div>

                    <span className="text-xs text-gray-400">
                      Ward: {wardDisplayLabel(lgas, inc.ward_id)}{" "}
                      {inc.polling_unit_id
                        ? `· PU: ${pollingUnitDisplayLabel(
                            lgas,
                            inc.ward_id,
                            inc.polling_unit_id,
                          )}`
                        : ""}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500">
                    Reported by{" "}
                    <span className="font-semibold text-gray-700">
                      {userNames.get(inc.reported_by) ?? UNKNOWN_MEMBER_NAME}
                    </span>
                  </p>

                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {inc.description}
                  </p>

                  {inc.cloudinary_url && (
                    <div className="pt-2">
                      <a
                        href={inc.cloudinary_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
                      >
                        <Upload className="h-3.5 w-3.5" /> View Photo Evidence
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
