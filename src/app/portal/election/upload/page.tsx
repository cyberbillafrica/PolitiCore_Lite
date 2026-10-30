"use client";


import { notify } from "@/lib/notify";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import {
  submitElectionResultWithEvidence,
  getPoliticalParties,
} from "@/lib/firebase/election";
import {
  getElectionResultsByWardAndPollingUnit,
  getElectionResultsByWard,
  getElectionResultsByWardAndLga,
  getElectionResultsByLga,
  getElectionResultsByState,
} from "@/lib/firebase/firestore";
import { electionRead } from "@/lib/firebase/query-debug";
import { resolveUserNames, UNKNOWN_MEMBER_NAME } from "@/lib/userNames";
import { assignmentCoversScope } from "@/lib/permissions";
import { uploadToCloudinary, cloudinaryFolder } from "@/lib/cloudinary";
import { getAllEnuguLGAs } from "@/lib/firebase/electoral";
import {
  contestCoversPollingUnit,
  contestCoversWard,
  deriveLgaIdFromWard,
  describeContestScope,
  isWithinContestScope,
  lgasWithinContestScope,
  pollingUnitDisplayLabel,
  wardDisplayLabel,
} from "@/lib/election-scope";
import {
  availableUploadLevels,
  getResultLevel,
  resultLevelMeta,
  type ElectionResultLevel,
} from "@/lib/election-levels";
import {
  useElectionMode,
  useActiveContest,
} from "@/hooks/useElectionEngine";
import BackToDashboardLink from "@/components/election/BackToDashboardLink";
import type { ElectionResultRecord, LGA, PoliticalParty } from "@/types";

/** The stored result adds contest/status fields the record type omits. */
type ExistingResult = ElectionResultRecord & {
  contest_id?: string;
  status?: string;
  state_id?: string | null;
};

const COORDINATOR_POSITIONS = [
  "ward_coordinator",
  "lga_coordinator",
  "zone_coordinator",
  "state_coordinator",
  "campaign_manager",
  "council_chairman",
] as const;

function statusLabel(status?: string): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "clarification_required":
      return "Clarification required";
    case "reopened":
      return "Reopened";
    default:
      return "Pending review";
  }
}

function formatSubmittedAt(value: unknown): string {
  if (!value) return "—";
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }
  if (typeof value === "object" && "toDate" in (value as object)) {
    try {
      return (value as { toDate: () => Date }).toDate().toLocaleString();
    } catch {
      return "—";
    }
  }
  return "—";
}
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Vote,
  Eye,
  ShieldAlert,
} from "lucide-react";

export default function ElectionUploadPage() {
  const router = useRouter();
  const { profile, assignments, loading: authLoading } = useAuth();
  const { electionMode, loading: electionModeLoading } = useElectionMode();

  useEffect(() => {
    if (authLoading) return;

    if (!profile) {
      router.replace("/portal/auth/login");
      return;
    }

    const isSocialOnly =
      profile?.membership_types?.includes("social_member") &&
      !profile?.membership_types?.includes("campaign_member") &&
      profile.access_role !== "election_officer" &&
      profile.access_role !== "admin";

    if (isSocialOnly) {
      router.replace("/portal/dashboard");
    }
  }, [profile, authLoading, router]);

  const isAdminOrElectionOfficer =
    profile?.access_role === "admin" ||
    profile?.access_role === "election_officer";

  /*
   * Round-4: the ACTIVE contest (election_settings.active_contest_id)
   * is the one and only submission target. There is no longer a
   * "pick whichever contest" fallback here — if no contest is active
   * the whole upload form is disabled.
   */
  const {
    contest: activeContest,
    loading: contestLoading,
    lgaIds: contestLgaIds,
  } = useActiveContest();

  const [lgas, setLgas] = useState<LGA[]>([]);
  const [allParties, setAllParties] = useState<PoliticalParty[]>([]);

  /*
   * No LGA is assumed. The LGA is the member's registered LGA (or the
   * LGA owning their registered ward) and is resolved once the Enugu
   * State LGA list has loaded.
   */
  const [form, setForm] = useState({
    lga_id: "",
    ward_id: isAdminOrElectionOfficer ? "" : (profile?.ward_id ?? ""),
    polling_unit_id: isAdminOrElectionOfficer
      ? ""
      : (profile?.polling_unit_id ?? ""),
  });

  // Dynamic party vote entries based on active contest configuration
  const [partyVotes, setPartyVotes] = useState<Record<string, number>>({});

  const [level, setLevel] = useState<ElectionResultLevel>("polling_unit");
  const [notes, setNotes] = useState("");

  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  /*
   * Duplicate-submission gate. The rules refuse a second create for the
   * same contest + polling unit, but only after the member has filled
   * the form and uploaded the EC8 photo. The card below is shown
   * INSTEAD of the form as soon as an existing result is found.
   */
  const [existingResult, setExistingResult] = useState<ExistingResult | null>(
    null,
  );
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [submitterName, setSubmitterName] = useState("");

  // Load LGAs & parties
  useEffect(() => {
    async function initData() {
      try {
        const lgaData = await getAllEnuguLGAs();
        setLgas(lgaData);

        const loadedParties = await getPoliticalParties();
        setAllParties(loadedParties);
      } catch (err) {
        console.error("Failed to load upload configuration:", err);
      } finally {
        setLoadingConfig(false);
      }
    }
    initData();
  }, []);

  /*
   * LGA options for admin/officer are limited to the active contest's
   * scope. A single-LGA contest locks the selector to that LGA.
   */
  const scopedLgaOptions = lgasWithinContestScope(activeContest, lgas);
  const singleLgaLocked =
    !!activeContest &&
    !!contestLgaIds &&
    contestLgaIds.length === 1 &&
    scopedLgaOptions.length === 1;

  /*
   * Place the submitter in the LGA that owns their registered ward once
   * the LGA list is known. Only fills an empty value, so an
   * administrator's explicit choice is never overwritten. No LGA is
   * assumed when the ward cannot be resolved.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (lgas.length === 0) return;

    const resolvedLgaId = deriveLgaIdFromWard(lgas, profile?.ward_id);

    if (!resolvedLgaId) return;

    setForm((prev) => (prev.lga_id ? prev : { ...prev, lga_id: resolvedLgaId }));
  }, [lgas, profile?.ward_id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Selected Contest Details & Tracked Parties
  const currentContest = activeContest;

  const trackedPartiesList = currentContest?.tracked_parties ?? [];

  /*
   * `trackedPartiesList` is a fresh array on every render, so this list
   * must be memoised on a string projection of it. Without the memo the
   * reset effect below re-ran on every render, wrote a brand-new
   * `partyVotes` object each time, and put the page in an infinite
   * render loop that froze the whole portal.
   */
  const trackedPartiesKey = trackedPartiesList.join("|");

  const trackedPartyObjects = useMemo(() => {
    return trackedPartiesList.map((pid) => {
      const pObj = allParties.find(
        (p) => p.id === pid.toLowerCase() || p.acronym.toLowerCase() === pid.toLowerCase()
      );
      return (
        pObj || {
          id: pid,
          acronym: pid.toUpperCase(),
          name: pid.toUpperCase(),
          inec_registered: true,
          status: "active" as const,
        }
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedPartiesKey, allParties]);

  // Reset/Initialize party vote object when contest changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const initialVotes: Record<string, number> = {};
    for (const p of trackedPartyObjects) {
      initialVotes[p.id] = 0;
    }
    setPartyVotes(initialVotes);
  }, [activeContest?.id, trackedPartyObjects]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /*
   * A single-LGA contest locks the geographic selector to that LGA —
   * there is nothing else to choose.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!singleLgaLocked) return;

    const lockedLgaId = scopedLgaOptions[0]?.id ?? "";
    if (!lockedLgaId) return;

    setForm((prev) =>
      prev.lga_id === lockedLgaId
        ? prev
        : { ...prev, lga_id: lockedLgaId, ward_id: "", polling_unit_id: "" },
    );
  }, [singleLgaLocked, scopedLgaOptions]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedLgaName = lgas.find((lga) => lga.id === form.lga_id);
  const wards = selectedLgaName?.wards ?? [];

  const selectedWard = wards.find((ward) => ward.id === form.ward_id);
  const pollingUnits = selectedWard?.pollingUnits ?? [];

  /*
   * Coordinator upload scope. A ward/LGA/zone/state coordinator may
   * choose any polling unit inside BOTH their assignment and the
   * active contest. Plain members and PU coordinators keep the fixed
   * registered-PU display.
   */
  const coordinatorAssignments = useMemo(
    () =>
      assignments.filter(
        (assignment) =>
          assignment.status === "active" &&
          (COORDINATOR_POSITIONS as readonly string[]).includes(
            assignment.position,
          ),
      ),
    [assignments],
  );

  const canSelectPollingUnit = coordinatorAssignments.length > 0;

  const availableLevels = useMemo(
    () =>
      availableUploadLevels({
        isAdminOrElectionOfficer,
        assignments: coordinatorAssignments,
        contest: activeContest,
      }),
    [isAdminOrElectionOfficer, coordinatorAssignments, activeContest],
  );

  /*
   * Ward/LGA options for the collation forms. Admin/officer may pick
   * anywhere in the active contest; a coordinator is limited to the
   * wards/LGAs their active assignment covers.
   */
  const allowedWardOptions = useMemo(() => {
    const wards = scopedLgaOptions.flatMap((lga) =>
      lga.wards.map((ward) => ({ ...ward, lgaId: lga.id })),
    );

    if (isAdminOrElectionOfficer) return wards;

    return wards.filter((ward) =>
      coordinatorAssignments.some((assignment) =>
        assignmentCoversScope(
          assignment,
          { scope_type: "ward", scope_id: ward.id },
          lgas,
        ),
      ),
    );
  }, [
    scopedLgaOptions,
    isAdminOrElectionOfficer,
    coordinatorAssignments,
    lgas,
  ]);

  const allowedLgaOptions = useMemo(() => {
    if (isAdminOrElectionOfficer) return scopedLgaOptions;

    return scopedLgaOptions.filter((lga) =>
      coordinatorAssignments.some((assignment) =>
        assignmentCoversScope(
          assignment,
          { scope_type: "lga", scope_id: lga.id },
          lgas,
        ),
      ),
    );
  }, [scopedLgaOptions, isAdminOrElectionOfficer, coordinatorAssignments, lgas]);

  const stateId = currentContest?.state_id || "enugu-state";

  const handleLevelChange = (next: ElectionResultLevel) => {
    if (next === level) return;

    setLevel(next);
    setExistingResult(null);
    setCheckingExisting(false);
    setSubmitterName("");
    setEvidenceFile(null);
    setEvidencePreview(null);
    setNotes("");
    setMessage("");
    setError("");

    if (next === "ward") {
      const single = allowedWardOptions.length === 1 ? allowedWardOptions[0] : null;
      setForm({
        lga_id: single?.lgaId ?? "",
        ward_id: single?.id ?? "",
        polling_unit_id: "",
      });
      return;
    }

    if (next === "lga") {
      const single = allowedLgaOptions.length === 1 ? allowedLgaOptions[0] : null;
      setForm({
        lga_id: single?.id ?? "",
        ward_id: "",
        polling_unit_id: "",
      });
      return;
    }

    if (next === "state") {
      setForm({ lga_id: "", ward_id: "", polling_unit_id: "" });
      return;
    }

    setForm({
      lga_id: isAdminOrElectionOfficer
        ? singleLgaLocked
          ? scopedLgaOptions[0]?.id ?? ""
          : ""
        : deriveLgaIdFromWard(lgas, profile?.ward_id),
      ward_id: isAdminOrElectionOfficer ? "" : profile?.ward_id ?? "",
      polling_unit_id: isAdminOrElectionOfficer
        ? ""
        : profile?.polling_unit_id ?? "",
    });
  };

  /* If a contest/role change removes the selected level, fall back to PU. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (availableLevels.length === 0) return;
    if (!availableLevels.includes(level)) setLevel("polling_unit");
  }, [availableLevels, level]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const allowedUnits = useMemo(() => {
    const units: Array<{
      lgaId: string;
      wardId: string;
      pollingUnitId: string;
    }> = [];

    if (!activeContest) return units;

    for (const lga of lgasWithinContestScope(activeContest, lgas)) {
      for (const ward of lga.wards) {
        for (const pollingUnit of ward.pollingUnits) {
          if (
            !contestCoversPollingUnit(
              activeContest,
              lga.id,
              ward.id,
              pollingUnit.id,
              lgas,
            )
          ) {
            continue;
          }

          if (
            !isAdminOrElectionOfficer &&
            !coordinatorAssignments.some((assignment) =>
              assignmentCoversScope(
                assignment,
                { scope_type: "ward", scope_id: ward.id },
                lgas,
              ),
            )
          ) {
            continue;
          }

          units.push({
            lgaId: lga.id,
            wardId: ward.id,
            pollingUnitId: pollingUnit.id,
          });
        }
      }
    }

    return units;
  }, [
    activeContest,
    coordinatorAssignments,
    isAdminOrElectionOfficer,
    lgas,
  ]);

  /*
   * A coordinator's registered home PU may sit outside their assigned
   * area. Clear it so the selector starts empty instead of carrying a
   * value that is not in the list (and whose duplicate check the rules
   * would deny).
   */
  useEffect(() => {
    if (!canSelectPollingUnit) return;
    if (!form.polling_unit_id) return;

    if (
      allowedUnits.some(
        (unit) => unit.pollingUnitId === form.polling_unit_id,
      )
    ) {
      return;
    }

    /* eslint-disable react-hooks/set-state-in-effect */
    setForm((prev) =>
      prev.polling_unit_id
        ? { ...prev, lga_id: "", ward_id: "", polling_unit_id: "" }
        : prev,
    );
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [allowedUnits, canSelectPollingUnit, form.polling_unit_id]);

  /*
   * The duplicate check runs before the form is shown. It is a QUERY, not
   * a `getDoc`: a missing deterministic id would itself be denied by the
   * read rule. Each level is queried by the scope field that proves
   * readability (PU: ward + PU, Ward: ward, LGA: LGA, State: state), then
   * filtered by contest and result_level in memory. Legacy documents
   * (no `result_level`) count as polling-unit results.
   */
  useEffect(() => {
    if (!activeContest?.id) {
      setExistingResult(null);
      setCheckingExisting(false);
      return;
    }

    if (level === "polling_unit") {
      if (!form.ward_id || !form.polling_unit_id) {
        setExistingResult(null);
        setCheckingExisting(false);
        return;
      }

      /*
       * A coordinator's home PU is cleared by the effect above; do not
       * run (or flash) a check for a unit outside the selector.
       */
      if (
        canSelectPollingUnit &&
        !allowedUnits.some(
          (unit) => unit.pollingUnitId === form.polling_unit_id,
        )
      ) {
        setExistingResult(null);
        setCheckingExisting(false);
        return;
      }
    } else if (level === "ward") {
      if (!form.ward_id) {
        setExistingResult(null);
        setCheckingExisting(false);
        return;
      }
    } else if (level === "lga") {
      if (!form.lga_id) {
        setExistingResult(null);
        setCheckingExisting(false);
        return;
      }
    } else if (!stateId) {
      setExistingResult(null);
      setCheckingExisting(false);
      return;
    }

    let cancelled = false;
    const contestId = activeContest.id;
    /*
     * The ward pre-check carries the ward's LGA too: an LGA/zone
     * coordinator's read grant is scoped to the LGA, and a ward-only
     * query cannot be proven readable by the rules.
     */
    const wardCheckLgaId =
      level === "ward" ? deriveLgaIdFromWard(lgas, form.ward_id) : "";
    setCheckingExisting(true);

    const queryExisting = (): Promise<ElectionResultRecord[]> => {
      if (level === "polling_unit") {
        return getElectionResultsByWardAndPollingUnit(
          form.ward_id,
          form.polling_unit_id,
        );
      }

      if (level === "ward") {
        return wardCheckLgaId
          ? getElectionResultsByWardAndLga(form.ward_id, wardCheckLgaId)
          : getElectionResultsByWard(form.ward_id);
      }

      if (level === "lga") {
        return getElectionResultsByLga(form.lga_id);
      }

      return getElectionResultsByState(stateId);
    };

    electionRead(
      {
        collection: "election_results",
        filter:
          level === "polling_unit"
            ? {
                ward_id: form.ward_id,
                polling_unit_id: form.polling_unit_id,
              }
            : level === "ward"
              ? { ward_id: form.ward_id, lga_id: wardCheckLgaId || undefined }
              : level === "lga"
                ? { lga_id: form.lga_id }
                : { state_id: stateId },
      },
      queryExisting,
    )
      .then((rows) => {
        if (cancelled) return;

        const match =
          (rows as ExistingResult[]).find((row) => {
            if (row.contest_id && row.contest_id !== contestId) return false;
            if (getResultLevel(row) !== level) return false;

            if (level === "polling_unit") {
              return row.polling_unit_id === form.polling_unit_id;
            }

            if (level === "ward") return row.ward_id === form.ward_id;
            if (level === "lga") return row.lga_id === form.lga_id;
            return row.state_id === stateId;
          }) ?? null;

        setExistingResult(match);
      })
      .catch(() => {
        /*
         * A failed check must not block a legitimate first submission;
         * the create rule remains the final guard.
         */
        if (!cancelled) setExistingResult(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingExisting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeContest?.id,
    allowedUnits,
    canSelectPollingUnit,
    form.ward_id,
    form.polling_unit_id,
    form.lga_id,
    lgas,
    level,
    stateId,
  ]);

  useEffect(() => {
    if (!existingResult?.submitted_by) {
      setSubmitterName("");
      return;
    }

    let cancelled = false;
    resolveUserNames([existingResult.submitted_by]).then((names) => {
      if (cancelled) return;
      setSubmitterName(
        names.get(existingResult.submitted_by) ?? UNKNOWN_MEMBER_NAME,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [existingResult]);

  // Resolved names for member reporting area
  const memberLgaId = deriveLgaIdFromWard(lgas, profile?.ward_id);
  const memberLga = lgas.find((lga) => lga.id === memberLgaId);
  const memberWard = memberLga?.wards.find((w) => w.id === profile?.ward_id);
  const memberPollingUnit = memberWard?.pollingUnits.find(
    (pu) => pu.id === profile?.polling_unit_id,
  );

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEvidenceFile(file);
      setEvidencePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    if (!electionMode) {
      notify.error(
        "Election mode is currently OFF. Result submission is disabled.",
      );
      return;
    }

    if (!currentContest) {
      notify.error(
        "No active contest — election operations are unavailable.",
      );
      return;
    }

    const levelMeta = resultLevelMeta(level);

    if (level === "polling_unit") {
      if (!form.ward_id || !form.polling_unit_id) {
        notify.error("Ward and polling unit are required.");
        return;
      }
    } else if (level === "ward") {
      if (!form.ward_id) {
        notify.error("A ward is required for an EC8B collation.");
        return;
      }
    } else if (level === "lga") {
      if (!form.lga_id) {
        notify.error("An LGA is required for an EC8C collation.");
        return;
      }
    } else if (!stateId) {
      notify.error("A state is required for an EC8D collation.");
      return;
    }

    if (!evidenceFile) {
      notify.error(
        `${levelMeta.formCode} / official result sheet photo evidence is required.`,
      );
      return;
    }

    if (level === "polling_unit") {
      /*
       * Coordinators may submit for any PU inside their assignment (the
       * selector only lists those); everyone else is pinned to their own
       * registered ward + polling unit. The rules enforce the same bound.
       */
      if (!isAdminOrElectionOfficer) {
        if (canSelectPollingUnit) {
          const allowed = allowedUnits.some(
            (unit) =>
              unit.wardId === form.ward_id &&
              unit.pollingUnitId === form.polling_unit_id,
          );

          if (!allowed) {
            notify.error(
              "Choose a polling unit inside your assigned area and the active contest.",
            );
            return;
          }
        } else if (
          form.ward_id !== profile?.ward_id ||
          form.polling_unit_id !== profile?.polling_unit_id
        ) {
          notify.error(
            "You can only submit results for your registered ward and polling unit.",
          );
          return;
        }
      }

      /*
       * Round-4: EVERY role — admin and officer included — must pick a
       * polling unit that sits inside the active contest's geographic
       * scope. The boundary comes from the contest (scope_type /
       * scope_id / lga_ids), never from a fixed LGA.
       */
      if (
        !contestCoversPollingUnit(
          currentContest,
          form.lga_id,
          form.ward_id,
          form.polling_unit_id,
          lgas,
        )
      ) {
        notify.error(
          "This polling unit is not within the scope of the active contest.",
        );
        return;
      }
    } else if (level === "ward") {
      const wardLgaId = deriveLgaIdFromWard(lgas, form.ward_id);

      if (!contestCoversWard(currentContest, wardLgaId, form.ward_id, lgas)) {
        notify.error(
          "This ward is not within the scope of the active contest.",
        );
        return;
      }

      if (
        !isAdminOrElectionOfficer &&
        !coordinatorAssignments.some((assignment) =>
          assignmentCoversScope(
            assignment,
            { scope_type: "ward", scope_id: form.ward_id },
            lgas,
          ),
        )
      ) {
        notify.error("This ward is outside your assigned upload scope.");
        return;
      }
    } else if (level === "lga") {
      if (
        !isWithinContestScope(
          currentContest,
          { lgaId: form.lga_id },
          lgas,
        )
      ) {
        notify.error("This LGA is not within the scope of the active contest.");
        return;
      }

      if (
        !isAdminOrElectionOfficer &&
        !coordinatorAssignments.some((assignment) =>
          assignmentCoversScope(
            assignment,
            { scope_type: "lga", scope_id: form.lga_id },
            lgas,
          ),
        )
      ) {
        notify.error("This LGA is outside your assigned upload scope.");
        return;
      }
    } else {
      if (currentContest.scope_type !== "state") {
        notify.error(
          "A state collation (EC8D) is only available for a state-wide contest.",
        );
        return;
      }

      if (
        !isAdminOrElectionOfficer &&
        !coordinatorAssignments.some(
          (assignment) =>
            assignment.scope_type === "state" ||
            assignment.scope_type === "campaign",
        )
      ) {
        notify.error("Only a state coordinator may submit a state collation.");
        return;
      }
    }

    // Format party vote payload
    const formattedResults = Object.entries(partyVotes)
      .map(([party, votes]) => ({ party, votes: Number(votes) || 0 }))
      .filter((r) => r.votes > 0);

    if (formattedResults.length === 0) {
      notify.error("Please enter at least one valid non-zero party vote count.");
      return;
    }

    const wardLgaId = deriveLgaIdFromWard(lgas, form.ward_id);
    const payloadLgaId =
      level === "state"
        ? ""
        : level === "lga"
          ? form.lga_id
          : level === "ward"
            ? wardLgaId
            : form.lga_id || wardLgaId;
    const payloadWardId =
      level === "polling_unit" || level === "ward" ? form.ward_id : "";
    const payloadPollingUnitId =
      level === "polling_unit" ? form.polling_unit_id : "";

    setSubmitting(true);
    try {
      // 1. Upload the level's evidence image to the election-results folder
      let cloudinaryUrl: string | null = null;
      try {
        cloudinaryUrl = await uploadToCloudinary(
          evidenceFile,
          cloudinaryFolder("election-results")
        );
      } catch (uploadErr: unknown) {
        const err = uploadErr as Error;
        console.error("Cloudinary upload error:", uploadErr);
        throw new Error(
          err.message || `Failed to upload ${levelMeta.formCode} image.`,
        );
      }

      if (!cloudinaryUrl) {
        throw new Error(
          `${levelMeta.formCode} photo upload failed. Please try again.`,
        );
      }

      // 2. Submit contest-aware result + evidence metadata to Firestore
      await submitElectionResultWithEvidence({
        electionCycleId: currentContest.election_cycle_id,
        contestId: currentContest.id,
        contestType: currentContest.contest_type,
        contestScope: {
          scope_type: currentContest.scope_type,
          scope_id: currentContest.scope_id,
        },
        resultLevel: level,
        lgaId: payloadLgaId,
        wardId: payloadWardId,
        pollingUnitId: payloadPollingUnitId,
        stateId,
        senatorialZoneId: currentContest.senatorial_zone_id || null,
        notes: notes.trim() || null,
        results: formattedResults,
        userId: profile?.id || "unknown",
        cloudinaryUrl,
        actorName: profile?.full_name || null,
        actorRole: profile?.access_role || null,
      });

      setMessage(
        `${levelMeta.label} ${levelMeta.formCode} result for ${currentContest.name} submitted successfully! It enters the Election Officer review queue.`
      );
      setEvidenceFile(null);
      setEvidencePreview(null);
      setNotes("");
    } catch (err: unknown) {
      const errorObj = err as Error;
      console.error("Submission failed:", err);
      notify.error(errorObj.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingConfig || contestLoading || checkingExisting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-apc-primary" />
        <p className="text-sm text-gray-500">Loading Election Configuration...</p>
      </div>
    );
  }

  if (!activeContest) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-2xl shadow-sm border border-gray-200 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">
          No Active Contest
        </h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          No active contest — election operations are unavailable. An
          administrator must activate a contest in the election control
          centre before results can be uploaded.
        </p>
      </div>
    );
  }

  const currentLevelMeta = resultLevelMeta(level);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div>
        <BackToDashboardLink />
        <div className="flex items-center gap-2 text-apc-primary font-semibold text-xs tracking-wide uppercase mb-1 mt-2">
          <Vote className="w-4 h-4" />
          <span>ELECTION OPERATIONS DESK</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          Upload Election Result & Form EC8 Evidence
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Submit EC8A polling-unit results and EC8B / EC8C / EC8D collations
          for the active election contest.
        </p>
      </div>

      {!electionModeLoading && !electionMode && (
        <div className="flex items-start gap-2 p-4 bg-gray-100 text-gray-700 rounded-xl border border-gray-300 text-xs font-medium">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <strong>Election mode is OFF.</strong> Result upload is disabled
            until an administrator turns election mode back on.
          </span>
        </div>
      )}

        {/* Prominent Election & Contest Header Specs (Sec 20 Requirement) */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase text-slate-400 block">
              Active Contest
            </span>
            <span className="font-bold text-base text-apc-light">
              {currentContest?.name || "—"}
            </span>
          </div>

          <div>
            <span className="text-xs uppercase text-slate-400 block">
              Scope / Constituency
            </span>
            <span className="font-mono text-xs bg-slate-800 px-2.5 py-1 rounded text-emerald-400">
              {describeContestScope(currentContest, lgas)}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          The active contest fixed by the administrator defines who may
          upload and where. Every collation level is bound to this scope.
        </p>
      </div>

      {/* Collation level selector — only levels the role may submit */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Collation Level
            </p>
            <p className="text-[11px] text-gray-500">
              Only the levels your role and assignment authorize are shown.
            </p>
          </div>
          <span className="text-[11px] font-bold text-apc-primary">
            {currentLevelMeta.formCode}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {availableLevels.map((option) => {
            const meta = resultLevelMeta(option);
            const selected = option === level;

            return (
              <button
                key={option}
                type="button"
                onClick={() => handleLevelChange(option)}
                aria-pressed={selected}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  selected
                    ? "border-apc-primary bg-apc-primary text-white"
                    : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className="block text-xs font-bold">{meta.label}</span>
                <span
                  className={`block text-[10px] font-semibold ${
                    selected ? "text-white/80" : "text-gray-400"
                  }`}
                >
                  {meta.formCode}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {level === "polling_unit" &&
        !isAdminOrElectionOfficer &&
        !canSelectPollingUnit && (
        <div className="p-4 bg-apc-light text-apc-primary rounded-xl border border-apc-primary/20 text-xs space-y-1">
          <p className="font-bold text-sm">Your Registered Polling Unit Scope</p>
          <p>
            <span className="font-semibold">LGA:</span>{" "}
            {memberLga ? memberLga.name : "Not set"} |{" "}
            <span className="font-semibold">Ward:</span>{" "}
            {memberWard ? `${memberWard.code} — ${memberWard.name}` : "Not set"} |{" "}
            <span className="font-semibold">Polling Unit:</span>{" "}
            {memberPollingUnit
              ? `${memberPollingUnit.code} — ${memberPollingUnit.name}`
              : "Not set"}
          </p>
        </div>
      )}

      {existingResult ? (
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Result already submitted for this {currentLevelMeta.entityNoun}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                A {currentLevelMeta.formCode} result already exists for this{" "}
                {currentLevelMeta.entityNoun} in the active contest, so this
                form is closed.
              </p>
            </div>
          </div>

          <dl className="grid gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Submitted by
              </dt>
              <dd className="mt-1 font-semibold text-gray-900">
                {submitterName || UNKNOWN_MEMBER_NAME}
              </dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Submitted on
              </dt>
              <dd className="mt-1 font-semibold text-gray-900">
                {formatSubmittedAt(existingResult.created_at)}
              </dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Status
              </dt>
              <dd className="mt-1 font-semibold text-gray-900">
                {statusLabel(existingResult.status)}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-3">
            <Link
              href={
                level === "polling_unit"
                  ? "/portal/election/results"
                  : "/portal/election"
              }
              className="inline-flex items-center gap-2 rounded-lg bg-apc-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-apc-dark"
            >
              <Eye className="w-4 h-4" /> View Result
            </Link>
            <Link
              href="/portal/campaign/issues"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <AlertCircle className="w-4 h-4" /> Raise an Issue
            </Link>
          </div>

          <p className="text-xs text-gray-500">
            If the submitted result contains errors, raise an issue so your
            ward coordinator can review it.
          </p>
        </div>
      ) : (
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6"
      >
        {/* Level-specific geographic location selection */}
        {level === "polling_unit" ? (
          <>
        {isAdminOrElectionOfficer ? (
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
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
                disabled={singleLgaLocked}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apc-primary disabled:bg-gray-100 text-xs"
                required
              >
                <option value="">
                  {singleLgaLocked ? "Locked by contest scope" : "Select LGA"}
                </option>
                {scopedLgaOptions.map((lga) => (
                  <option key={lga.id} value={lga.id}>
                    {lga.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
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
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apc-primary disabled:bg-gray-100 text-xs"
                required
              >
                <option value="">
                  {form.lga_id ? "Select ward" : "Select an LGA first"}
                </option>
                {wards.map((ward) => (
                  <option key={ward.id} value={ward.id}>
                    {ward.code} — {ward.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Polling Unit *
              </label>
              <select
                value={form.polling_unit_id}
                onChange={(e) =>
                  setForm({ ...form, polling_unit_id: e.target.value })
                }
                disabled={!form.ward_id}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apc-primary disabled:bg-gray-100 text-xs"
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
        ) : canSelectPollingUnit ? (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Polling Unit *
            </label>
            <select
              value={form.polling_unit_id}
              onChange={(e) => {
                const unit = allowedUnits.find(
                  (item) => item.pollingUnitId === e.target.value,
                );
                setForm({
                  ...form,
                  lga_id: unit?.lgaId ?? "",
                  ward_id: unit?.wardId ?? "",
                  polling_unit_id: e.target.value,
                });
              }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apc-primary text-xs"
              required
            >
              <option value="">Select a polling unit in your area</option>
              {Array.from(new Set(allowedUnits.map((unit) => unit.wardId))).map(
                (wardId) => (
                  <optgroup
                    key={wardId}
                    label={wardDisplayLabel(lgas, wardId)}
                  >
                    {allowedUnits
                      .filter((unit) => unit.wardId === wardId)
                      .map((unit) => (
                        <option
                          key={unit.pollingUnitId}
                          value={unit.pollingUnitId}
                        >
                          {pollingUnitDisplayLabel(
                            lgas,
                            unit.wardId,
                            unit.pollingUnitId,
                          )}
                        </option>
                      ))}
                  </optgroup>
                ),
              )}
            </select>
            <p className="text-[11px] text-gray-500">
              Only polling units inside your assignment scope and the active
              contest are listed.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Ward
              </label>
              <input
                type="text"
                readOnly
                value={
                  memberWard
                    ? `${form.ward_id} (${memberWard.name})`
                    : form.ward_id
                }
                className="w-full px-3 py-2 border bg-gray-50 rounded-lg text-xs font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Polling Unit
              </label>
              <input
                type="text"
                readOnly
                value={
                  memberPollingUnit
                    ? `${form.polling_unit_id} (${memberPollingUnit.name})`
                    : form.polling_unit_id
                }
                className="w-full px-3 py-2 border bg-gray-50 rounded-lg text-xs font-medium"
              />
            </div>
          </div>
        )}
          </>
        ) : level === "ward" ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Ward *
              </label>
              <select
                value={form.ward_id}
                onChange={(e) => {
                  const ward = allowedWardOptions.find(
                    (item) => item.id === e.target.value,
                  );
                  setForm({
                    ...form,
                    lga_id: ward?.lgaId ?? "",
                    ward_id: e.target.value,
                    polling_unit_id: "",
                  });
                }}
                disabled={allowedWardOptions.length === 1}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apc-primary disabled:bg-gray-100 text-xs"
                required
              >
                <option value="">
                  {allowedWardOptions.length === 1
                    ? "Locked to your assigned ward"
                    : "Select ward"}
                </option>
                {scopedLgaOptions.map((lga) => {
                  const wardOptions = allowedWardOptions.filter(
                    (ward) => ward.lgaId === lga.id,
                  );
                  if (wardOptions.length === 0) return null;

                  return (
                    <optgroup key={lga.id} label={lga.name}>
                      {wardOptions.map((ward) => (
                        <option key={ward.id} value={ward.id}>
                          {ward.code} — {ward.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
            <p className="text-[11px] text-gray-500">
              Only wards inside your assignment scope and the active contest
              are listed.
            </p>
          </div>
        ) : level === "lga" ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
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
                disabled={allowedLgaOptions.length === 1}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apc-primary disabled:bg-gray-100 text-xs"
                required
              >
                <option value="">
                  {allowedLgaOptions.length === 1
                    ? "Locked to your assigned LGA"
                    : "Select LGA"}
                </option>
                {allowedLgaOptions.map((lga) => (
                  <option key={lga.id} value={lga.id}>
                    {lga.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-gray-500">
              Only LGAs inside your assignment scope and the active contest are
              listed.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs space-y-1">
            <p className="font-bold text-gray-800">State collation (EC8D)</p>
            <p className="text-gray-600">
              State: <span className="font-semibold">{stateId}</span>
            </p>
            <p className="text-gray-500">
              The state is fixed by the active state-wide contest.
            </p>
          </div>
        )}

        {/* Level-specific Form EC8 evidence photo upload */}
        <div className="border-t pt-6">
          <label className="block text-sm font-semibold text-gray-900 mb-1">
            Official Form {currentLevelMeta.formCode} Result Sheet Evidence Photo *
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Upload a clear photo of the signed Form {currentLevelMeta.formCode}{" "}
            result document for this {currentLevelMeta.entityNoun}.
          </p>

          <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-6 bg-gray-50 hover:bg-gray-100/50 transition-colors">
            {evidencePreview ? (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden border mb-3 bg-slate-900">
                <img
                  src={evidencePreview}
                  alt={`Form ${currentLevelMeta.formCode} Result Sheet`}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <Upload className="h-10 w-10 text-gray-400 mb-2" />
            )}

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              required={!evidenceFile}
              className="text-xs text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-apc-primary file:text-white hover:file:bg-apc-dark cursor-pointer"
            />
          </div>
        </div>

        {/* Dynamic Party Vote Inputs (Spec Section 21) */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-apc-primary">
              Party Vote Input Fields ({trackedPartyObjects.length} Tracked Parties)
            </h3>
            <span className="text-xs text-gray-500">
              Dynamically loaded from Contest Config
            </span>
          </div>

          {trackedPartyObjects.length === 0 ? (
            <div className="p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs font-semibold">
              No tracked parties configured for this contest. Contact the election administrator.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {trackedPartyObjects.map((party) => (
                <div key={party.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <label className="block text-xs font-bold text-gray-800 uppercase mb-1">
                    {party.acronym} — {party.name}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={partyVotes[party.id] ?? 0}
                    onChange={(e) =>
                      setPartyVotes({
                        ...partyVotes,
                        [party.id]: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apc-primary text-sm font-mono font-bold"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {level !== "polling_unit" && (
          <div className="border-t pt-6">
            <label className="block text-sm font-semibold text-gray-900 mb-1">
              Notes (optional)
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Add any context the election officer should see while reviewing
              this {currentLevelMeta.label} collation.
            </p>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={`e.g. EC8${currentLevelMeta.formCode.slice(-1)} collation sheet signed by the ward agent`}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-apc-primary text-xs"
            />
          </div>
        )}

        {message && (
          <div className="flex items-center gap-2 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200 text-xs font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={
            submitting ||
            trackedPartyObjects.length === 0 ||
            electionModeLoading ||
            !electionMode ||
            !activeContest
          }
          className="w-full bg-apc-primary text-white py-3 rounded-xl font-bold hover:bg-apc-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                Uploading Form {currentLevelMeta.formCode} & Registering
                Submission...
              </span>
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              <span>
                Submit {currentLevelMeta.label} Result (
                {currentLevelMeta.formCode})
              </span>
            </>
          )}
        </button>
      </form>
      )}
    </div>
  );
}
