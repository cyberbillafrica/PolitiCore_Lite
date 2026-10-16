"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  createPUReport,
  subscribeToPUReports,
  type PUReportDoc,
} from "@/lib/firebase/election";
import { uploadToCloudinary } from "@/lib/cloudinary";
import {
  getAllEnuguLGAs,
} from "@/lib/firebase/electoral";
import { deriveLgaIdFromWard, lgasWithinContestScope, contestCoversPollingUnit, describeContestScope } from "@/lib/election-scope";
import { buildElectionReadScope } from "@/lib/election-read-scope";
import { useElectionMode, useActiveContest } from "@/hooks/useElectionEngine";
import BackToDashboardLink from "@/components/election/BackToDashboardLink";
import { resolveUserNames, UNKNOWN_MEMBER_NAME } from "@/lib/userNames";
import {
  NO_ACTIVE_CONTEST_MESSAGE,
  type PUReportScopeConstraint,
} from "@/lib/firebase/election";
import type { LGA } from "@/types";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Upload,
  X,
  MapPin,
  Lock,
} from "lucide-react";

export default function PUReportsPage() {
  const { profile, assignments, accessLoading } = useAuth();
  const isAdmin = profile?.access_role === "admin";
  const { electionMode, loading: electionModeLoading } = useElectionMode();

  /*
   * Round-4: the active contest scopes EVERY submission — admins and
   * officers included. With no active contest the form is disabled.
   */
  const { contest: activeContest, loading: contestLoading } =
    useActiveContest();

  const [lgas, setLgas] = useState<LGA[]>([]);
  const [reports, setReports] = useState<PUReportDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMessage] = useState("");

  /*
   * No LGA is assumed. The submitter's LGA is their registered LGA — or
   * the LGA that owns their registered ward — resolved once the Enugu
   * State LGA list has loaded.
   */
  const [form, setForm] = useState({
    lga_id: "",
    ward_id: profile?.ward_id ?? "",
    polling_unit_id: profile?.polling_unit_id ?? "",
    report_type: "conduct" as PUReportDoc["report_type"],
    title: "",
    content: "",
  });

  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);

  /*
   * Batch-resolved submitter display names. Collected once per page
   * load (not per row) — see src/lib/userNames.ts. A missing or
   * nameless profile renders "Unknown member", never a doc id.
   */
  const [userNames, setUserNames] = useState<Map<string, string>>(
    () => new Map(),
  );

  // Load LGAs
  useEffect(() => {
    async function loadLgas() {
      const data = await getAllEnuguLGAs();
      setLgas(data);
    }
    loadLgas();
  }, []);

  /*
   * The LGA selector is constrained to the ACTIVE CONTEST's scope
   * (see src/lib/election-scope.ts). For admins and election officers
   * the whole contest span is choosable; members were already locked
   * to their registered ward below.
   */
  const { contest: puActiveContest } = useActiveContest();
  const scopedLgaOptions = lgasWithinContestScope(puActiveContest, lgas);

  const resolvedLgaId = deriveLgaIdFromWard(lgas, profile?.ward_id);

  /*
   * Fill the LGA once the LGA list is known, but only when it is still
   * empty so an explicit choice is never overwritten.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!resolvedLgaId) return;

    setForm((prev) => (prev.lga_id ? prev : { ...prev, lga_id: resolvedLgaId }));
  }, [resolvedLgaId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /*
   * Real-time PU Reports Listener.
   *
   * Every listener carries an equality filter the `pu_reports` read
   * rule can prove in advance (own submissions, or ward / PU reads
   * backed by the caller's `user_access` projection). Over-fetching
   * and filtering client-side is what used to make the whole query
   * fail with "Missing or insufficient permissions" for members.
   */
  useEffect(() => {
    if (accessLoading || !profile) {
      return;
    }

    const scope = buildElectionReadScope(profile, assignments, lgas);

    const constraints: PUReportScopeConstraint[] = [];

    if (!scope.unrestricted) {
      constraints.push(...scope.geoConstraints);

      // A member always reads their own submissions.
      if (profile.id) {
        constraints.push({ submitted_by: profile.id });
      }
    }

    if (!scope.unrestricted && constraints.length === 0) {
      // Nothing is provably readable — open no listener at all.
      setReports([]);
      setLoading(false);
      return;
    }

    const [primary, ...additional] = constraints;

    const unsubscribe = subscribeToPUReports(
      (docs) => {
        setReports(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load PU reports:", err);
        setLoadError("PU reports could not be loaded. Please try again.");
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
  const filteredReports = reports;

  /*
   * One batched name lookup per snapshot instead of one fetch per
   * row. resolveUserNames always returns an entry per uid, so the
   * render map lookup can fall back to "Unknown member".
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const uids = Array.from(
      new Set(reports.map((r) => r.submitted_by)),
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
  }, [reports]);
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
    setFormError("");
    setSuccessMessage("");

    if (electionModeLoading || !electionMode) {
      setFormError(
        "Election mode is currently OFF. PU report submission is disabled.",
      );
      return;
    }

    if (!activeContest) {
      setFormError(NO_ACTIVE_CONTEST_MESSAGE);
      return;
    }

    if (!form.ward_id || !form.polling_unit_id) {
      setFormError("Ward and polling unit are required.");
      return;
    }

    if (!form.title.trim() || !form.content.trim()) {
      setFormError("Title and description content are required.");
      return;
    }

    // Scoping check for non-admin
    if (!isAdmin) {
      if (
        form.ward_id !== profile?.ward_id ||
        form.polling_unit_id !== profile?.polling_unit_id
      ) {
        setFormError(
          "You can only submit PU reports for your registered Ward and Polling Unit.",
        );
        return;
      }
    }

    /*
     * Round-4: every role — admin and officer included — may only
     * submit inside the active contest's geographic scope. The service
     * re-checks this too (createPUReport reads the active contest
     * itself), so direct API posts are refused as well.
     */
    if (
      !contestCoversPollingUnit(
        activeContest,
        form.lga_id,
        form.ward_id,
        form.polling_unit_id,
        lgas,
      )
    ) {
      setFormError(
        "This polling unit is not within the scope of the active contest.",
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
            "ifeanyi-2027/pu-reports",
          );
        } catch (uploadErr) {
          console.warn("Cloudinary evidence upload fallback:", uploadErr);
        }
      }

      await createPUReport({
        ward_id: form.ward_id,
        lga_id: form.lga_id,
        polling_unit_id: form.polling_unit_id,
        submitted_by: profile?.id || "unknown",
        report_type: form.report_type,
        title: form.title.trim(),
        content: form.content.trim(),
        cloudinary_url: cloudinaryUrl,
      });

      setSuccessMessage("Polling unit report submitted successfully!");
      setShowForm(false);
      setForm({
        lga_id: resolvedLgaId,
        ward_id: profile?.ward_id ?? "",
        polling_unit_id: profile?.polling_unit_id ?? "",
        report_type: "conduct",
        title: "",
        content: "",
      });
      setEvidenceFile(null);
      setEvidencePreview(null);
    } catch (err: any) {
      console.error("Failed to create PU report:", err);
      setFormError(err.message || "Failed to submit report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (accessLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-apc-primary" />
        <span className="ml-3 text-gray-500">Loading PU reports...</span>
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
            Polling Unit Reports
          </h1>
          <p className="text-sm text-gray-500">
            Submit and inspect polling unit conduct, opening, turnout, and
            closing reports.
          </p>
        </div>

        <button
          onClick={() => {
            setShowForm((prev) => !prev);
            setFormError("");
            setSuccessMessage("");
          }}
          disabled={electionModeLoading || contestLoading || !electionMode || !activeContest}
          className="inline-flex items-center gap-2 rounded-lg bg-apc-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-apc-dark transition-colors disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
        >
          <Plus className="h-4 w-4" />
          {showForm ? "Cancel" : "Submit PU Report"}
        </button>
      </div>

      {!electionModeLoading && !electionMode && (
        <div className="flex items-start gap-2 rounded-lg border border-gray-300 bg-gray-100 p-4 text-sm font-medium text-gray-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Election mode is OFF.</strong> Polling unit reports are
            read-only until an administrator turns election mode back on.
          </span>
        </div>
      )}

      {!contestLoading && !activeContest && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>
              No active contest — election operations are unavailable.
            </strong>{" "}
            Report submission is disabled until an administrator activates a
            contest.
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
        <Card className="border-apc-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Submit Polling Unit Report
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
              {formError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Location Selectors */}
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
                    className="w-full px-3 py-2 border rounded-lg text-sm"
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
                    disabled={!form.lga_id}
                    className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-100"
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
                    Polling Unit *
                  </label>
                  <select
                    value={form.polling_unit_id}
                    onChange={(e) =>
                      setForm({ ...form, polling_unit_id: e.target.value })
                    }
                    disabled={!form.ward_id}
                    className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-100"
                    required
                  >
                    <option value="">
                      {form.ward_id
                        ? "Select polling unit"
                        : "Select Ward first"}
                    </option>
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
                    Report Type *
                  </label>
                  <select
                    value={form.report_type}
                    onChange={(e) =>
                      setForm({ ...form, report_type: e.target.value as PUReportDoc["report_type"] })
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    required
                  >
                    <option value="opening">PU Opening & Setup</option>
                    <option value="turnout">Voter Turnout</option>
                    <option value="conduct">Voting Conduct</option>
                    <option value="closing">PU Closing & Counting</option>
                    <option value="general">General PU Report</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Report Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    placeholder="e.g. Voting started peacefully at 8:30 AM"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Report Content / Description *
                </label>
                <textarea
                  rows={4}
                  required
                  value={form.content}
                  onChange={(e) =>
                    setForm({ ...form, content: e.target.value })
                  }
                  placeholder="Provide detailed observation of polling unit proceedings..."
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              {/* Photo Evidence */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Photo Evidence (Optional)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageChange}
                    className="text-xs text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-apc-primary file:text-white"
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
                    !activeContest
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-apc-primary px-5 py-2 text-sm font-semibold text-white hover:bg-apc-dark disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Submit Report</span>
                  )}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Reports Listing */}
      <Card>
        <CardHeader>
          <CardTitle>Reports ({filteredReports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p className="py-10 text-center text-sm text-red-600">
              {loadError}
            </p>
          ) : filteredReports.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                No polling unit reports submitted in this scope yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredReports.map((r) => (
                <div
                  key={r.id}
                  className="bg-white border rounded-xl p-5 space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-apc-primary/10 text-apc-primary uppercase">
                        {r.report_type}
                      </span>
                      <h3 className="font-bold text-gray-900">{r.title}</h3>
                    </div>

                    <span className="text-xs text-gray-400">
                      PU: {r.polling_unit_id} · Ward: {r.ward_id}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500">
                    Submitted by{" "}
                    <span className="font-semibold text-gray-700">
                      {userNames.get(r.submitted_by) ?? UNKNOWN_MEMBER_NAME}
                    </span>
                  </p>

                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {r.content}
                  </p>

                  {r.cloudinary_url && (
                    <div className="pt-2">
                      <a
                        href={r.cloudinary_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-apc-primary hover:underline"
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
