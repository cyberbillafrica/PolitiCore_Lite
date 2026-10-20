"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  AlertCircle,
  CheckCircle2,
  Upload,
  AlertTriangle,
  Bell,
  Eye,
  Edit3,
  X,
  History,
  Loader2,
  Lock,
  Vote,
  Layers,
  ArrowRightLeft,
  Filter,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { getAllEnuguLGAs } from "@/lib/firebase/electoral";
import { assignmentCoversScope } from "@/lib/permissions";
import { useElectionMode, useActiveContest } from "@/hooks/useElectionEngine";
import {
  lgasWithinContestScope,
  describeContestScope,
} from "@/lib/election-scope";
import { lgaIdForResult } from "@/lib/election-read-scope";
import BackToDashboardLink from "@/components/election/BackToDashboardLink";
import { notify } from "@/lib/notify";
import {
  subscribeToElectionResults,
  correctElectionResult,
  getElectionCycles,
  getContestsByCycle,
  getPoliticalParties,
  getElectionSettings,
  type ElectionResultDoc,
  type ElectionPartyResult,
  type ElectionResultScopeConstraint,
} from "@/lib/firebase/election";
import type {
  LGA,
  Ward,
  ElectionCycle,
  ElectionContest,
  PoliticalParty,
} from "@/types";

interface AlertToast {
  id: string;
  puName: string;
  wardName: string;
  lgaName: string;
  results: ElectionPartyResult[];
}

function getDocTimestamp(doc: ElectionResultDoc): number {
  const ts = doc.updated_at || doc.created_at;
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts === "string") {
    const t = new Date(ts).getTime();
    return isNaN(t) ? 0 : t;
  }
  if (typeof ts === "object") {
    if (
      "seconds" in ts &&
      typeof (ts as { seconds?: number }).seconds === "number"
    ) {
      return (ts as { seconds: number }).seconds * 1000;
    }
    if (ts instanceof Date) {
      return ts.getTime();
    }
  }
  return 0;
}

export default function ElectionDashboard() {
  const router = useRouter();
  const { profile, assignments, accessLoading } = useAuth();
  const isAdmin = profile?.access_role === "admin";
  const { electionMode, loading: electionModeLoading } = useElectionMode();

  /*
   * The ACTIVE CONTEST defines this dashboard's geographic scope.
   * `contestLgaIds` is null for a state-wide (or wider) contest and
   * a list of LGA ids for anything narrower — the single source of
   * truth for every geographic filter below.
   */
  const { contest: activeContest, lgaIds: contestLgaIds } = useActiveContest();

  useEffect(() => {
    if (accessLoading) return;

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
  }, [profile, accessLoading, router]);

  const [lgas, setLgas] = useState<LGA[]>([]);
  const [allLgas, setAllLgas] = useState<LGA[]>([]);
  const [cycles, setCycles] = useState<ElectionCycle[]>([]);
  const [contests, setContests] = useState<ElectionContest[]>([]);
  const [allParties, setAllParties] = useState<PoliticalParty[]>([]);
  const [results, setResults] = useState<ElectionResultDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [listenerError, setListenerError] = useState<string | null>(null);

  // Selection states
  const [selectedCycleId, setSelectedCycleId] = useState<string>("all");
  const [selectedContestId, setSelectedContestId] = useState<string>("all");
  const [selectedLgaId, setSelectedLgaId] = useState<string>("all");
  const [selectedWardId, setSelectedWardId] = useState<string>("all");

  // Configurable Party Comparison (Spec Section 38 & 39)
  const [comparePartyA, setComparePartyA] = useState<string>("");
  const [comparePartyB, setComparePartyB] = useState<string>("");

  // Modals & Toasts
  const [toastAlerts, setToastAlerts] = useState<AlertToast[]>([]);
  const lastToastTimeRef = useRef<number>(0);
  const [inspectResult, setInspectResult] = useState<ElectionResultDoc | null>(
    null,
  );
  const [editingResult, setEditingResult] = useState<ElectionResultDoc | null>(
    null,
  );
  const [editFormResults, setEditFormResults] = useState<ElectionPartyResult[]>(
    [],
  );
  const [editReason, setEditReason] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Initial load
  useEffect(() => {
    async function init() {
      try {
        const lgaData = await getAllEnuguLGAs();
        setLgas(lgaData);
        setAllLgas(lgaData);

        const loadedSettings = await getElectionSettings();
        const loadedCycles = await getElectionCycles();
        setCycles(loadedCycles);

        const defaultCycle =
          loadedSettings?.active_election_cycle_id ||
          loadedCycles[0]?.id ||
          "general-election-2027";
        setSelectedCycleId(defaultCycle);

        const loadedContests = await getContestsByCycle(defaultCycle);
        setContests(loadedContests);

        const activeContest =
          loadedSettings?.active_contest_id || loadedContests[0]?.id || "all";
        setSelectedContestId(activeContest);

        const loadedParties = await getPoliticalParties();
        setAllParties(loadedParties);
      } catch (err) {
        console.error("Failed to load initial election dashboard data:", err);
      }
    }
    init();
  }, []);

  // Update contests when cycle selection changes
  useEffect(() => {
    if (selectedCycleId === "all") {
      if (cycles.length > 0) {
        getContestsByCycle(cycles[0].id).then((cList) => setContests(cList));
      }
    } else {
      getContestsByCycle(selectedCycleId).then((cList) => setContests(cList));
    }
  }, [selectedCycleId, cycles]);

  /*
   * ============================================================
   * RESULT READ SCOPE (mirrors canReadElectionResult in the rules)
   * ============================================================
   *
   * Firestore is not a filter: a query must be provably readable in
   * full, or the whole listener is rejected with permission-denied.
   * Every listener below therefore carries an equality filter the
   * security rule can evaluate:
   *
   *   - admin / election officer   -> the active contest (or the whole
   *                                   collection when no contest is chosen)
   *   - an active assignment       -> that ward, or every ward of the
   *                                   assignment's LGA, or its polling unit
   *   - the member's own record    -> their registered ward + polling unit
   *
   * A member with neither an assignment nor a registered polling unit
   * cannot read anything, so no listener is opened at all rather than
   * issuing an over-broad query that would fail.
   */
  const resultScope = useMemo(() => {
    const contestFilter =
      selectedContestId !== "all" ? selectedContestId : undefined;

    const withContest = (constraint: Omit<ElectionResultScopeConstraint, "contest_id">) => ({
      ...(contestFilter ? { contest_id: contestFilter } : {}),
      ...constraint,
    });

    if (isAdmin || profile?.access_role === "election_officer") {
      return {
        constraints: [
          contestFilter ? { contest_id: contestFilter } : {},
        ] as ElectionResultScopeConstraint[],
        restricted: false,
      };
    }

    const constraints: ElectionResultScopeConstraint[] = [];

    // The member's own registered polling unit is always readable.
    if (profile?.ward_id && profile?.polling_unit_id) {
      constraints.push(
        withContest({
          ward_id: profile.ward_id,
          polling_unit_id: profile.polling_unit_id,
        }),
      );
    }

    for (const assignment of assignments) {
      if (assignment.status !== "active") continue;

      /*
       * A state-wide (or campaign-wide) assignment covers everything, so
       * the projection in user_access grants it globally and no per-ward
       * filter is needed or provable.
       */
      if (
        assignment.scope_type === "state" ||
        assignment.scope_type === "campaign"
      ) {
        return {
          constraints: [
            contestFilter ? { contest_id: contestFilter } : {},
          ] as ElectionResultScopeConstraint[],
          restricted: false,
        };
      }

      if (assignment.scope_type === "ward" && assignment.scope_id) {
        constraints.push(withContest({ ward_id: assignment.scope_id }));
        continue;
      }

      if (
        assignment.scope_type === "polling_unit" &&
        assignment.scope_id
      ) {
        constraints.push(withContest({ polling_unit_id: assignment.scope_id }));
        continue;
      }

      if (assignment.scope_type === "lga" && assignment.scope_id) {
        const scopeId = assignment.scope_id.toLowerCase();
        const lga = lgas.find(
          (item) =>
            item.id.toLowerCase() === scopeId ||
            item.id.toLowerCase() === scopeId.replace(/-lga$/, ""),
        );

        for (const ward of lga?.wards ?? []) {
          constraints.push(withContest({ ward_id: ward.id }));
        }
      }
    }

    // Collapse duplicates so one LGA assignment does not double-subscribe.
    const seen = new Set<string>();
    const unique = constraints.filter((constraint) => {
      const key = JSON.stringify(constraint);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { constraints: unique, restricted: true };
  }, [isAdmin, profile, assignments, selectedContestId, lgas]);

  // Real-time Firestore Listener
  useEffect(() => {
    /*
     * Nothing is readable for this account: skip the listener entirely
     * rather than issuing a query the rules would reject.
     */
    if (resultScope.restricted && resultScope.constraints.length === 0) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setResults([]);
      setLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    const [primaryConstraint, ...additionalConstraints] =
      resultScope.constraints;

    const unsubscribe = subscribeToElectionResults(
      (docs, isInitialLoad) => {
        setResults(docs);
        setLoading(false);

        if (isInitialLoad) {
          let maxTime = 0;
          for (const d of docs) {
            const t = getDocTimestamp(d);
            if (t > maxTime) maxTime = t;
          }
          if (maxTime > lastToastTimeRef.current) {
            lastToastTimeRef.current = maxTime;
          }
        } else if (docs.length > 0) {
          let newest: ElectionResultDoc | null = null;
          let maxTime = 0;

          for (const d of docs) {
            const t = getDocTimestamp(d);
            if (t > maxTime) {
              maxTime = t;
              newest = d;
            }
          }

          if (
            newest &&
            newest.status === "approved" &&
            maxTime > lastToastTimeRef.current
          ) {
            lastToastTimeRef.current = maxTime;

            let puName = newest.polling_unit_id;
            let wardName = newest.ward_id;
            let lgaName = "Enugu";

            for (const lga of lgas) {
              for (const ward of lga.wards) {
                const pu = ward.pollingUnits.find(
                  (p) => p.id === newest!.polling_unit_id,
                );
                if (pu) {
                  puName = `${pu.code} — ${pu.name}`;
                  wardName = `${ward.code} — ${ward.name}`;
                  lgaName = lga.name;
                }
              }
            }

            const alert: AlertToast = {
              id: `${newest.id}_${Date.now()}`,
              puName,
              wardName,
              lgaName,
              results: newest.results,
            };

            setToastAlerts((prev) => [...prev, alert]);
            setTimeout(() => {
              setToastAlerts((prev) => prev.filter((a) => a.id !== alert.id));
            }, 6000);
          }
        }
      },
      (err) => {
        console.error("Error subscribing to election results:", err);
        setListenerError(
          "Live data stream disconnected. Please refresh the page to retry.",
        );
        setLoading(false);
      },
      primaryConstraint,
      additionalConstraints,
    );

    return () => unsubscribe();
  }, [lgas, resultScope]);

  // Hierarchical Scope Filtering
  const coveredResults = useMemo(() => {
    if (isAdmin || profile?.access_role === "election_officer") return results;

    const activeAssignments = assignments.filter((a) => a.status === "active");

    // Ordinary member without specific administrative assignments is scoped to their registered PU
    if (activeAssignments.length === 0) {
      if (profile?.ward_id && profile?.polling_unit_id) {
        return results.filter(
          (r) =>
            r.ward_id === profile.ward_id &&
            r.polling_unit_id === profile.polling_unit_id,
        );
      }
      return [];
    }

    return results.filter((result) => {
      // Check if user's registered PU matches
      if (
        profile?.ward_id === result.ward_id &&
        profile?.polling_unit_id === result.polling_unit_id
      ) {
        return true;
      }

      return activeAssignments.some(
        (assignment) =>
          assignmentCoversScope(
            assignment,
            { scope_type: "ward", scope_id: result.ward_id },
            lgas,
          ) ||
          assignmentCoversScope(
            assignment,
            { scope_type: "polling_unit", scope_id: result.polling_unit_id },
            lgas,
          ),
      );
    });
  }, [isAdmin, profile, assignments, results, lgas]);

  /*
   * ============================================================
   * CONTEST-SCOPED GEOGRAPHY
   * ============================================================
   *
   * `lgas` is filtered down to the active contest's scope, so every
   * LGA dropdown, ward list and PU denominator below is constrained
   * by it. Nothing defaults to "all of Enugu" unless the active
   * contest is state-wide (in which case `contestLgaIds` is null and
   * lgas === allLgas).
   */
  const scopedLgas = useMemo(
    () => lgasWithinContestScope(activeContest, lgas),
    [activeContest, lgas],
  );

  // A contest confined to exactly one LGA locks the LGA selector.
  const lgaFilterLocked =
    contestLgaIds !== null && contestLgaIds.length === 1;

  /*
   * Results outside the contest's geographic scope must never feed
   * the aggregate numbers even when the underlying listener can read
   * them (admins hear the whole collection). Contest scope is the
   * single source of truth.
   */
  const contestScopedResults = useMemo(() => {
    if (!contestLgaIds) return coveredResults;
    const allowed = new Set(contestLgaIds.map((id) => id.toLowerCase()));
    return coveredResults.filter((r) =>
      allowed.has(lgaIdForResult(lgas, r.lga_id, r.ward_id).toLowerCase()),
    );
  }, [coveredResults, contestLgaIds, lgas]);

  // Keep the selected LGA valid if the contest scope changes.
  useEffect(() => {
    if (contestLgaIds === null) return;

    if (!lgaFilterLocked) return;

    /* eslint-disable react-hooks/set-state-in-effect */
    setSelectedLgaId(contestLgaIds[0]);
    setSelectedWardId("all");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [contestLgaIds, lgaFilterLocked]);

  // Operational Submissions vs Official Results
  const officialApprovedResults = useMemo(() => {
    return contestScopedResults.filter((r) => r.status === "approved");
  }, [contestScopedResults]);

  const operationalSubmissions = useMemo(() => {
    return contestScopedResults.filter((r) => {
      if (
        selectedContestId !== "all" &&
        r.contest_id &&
        r.contest_id !== selectedContestId
      ) {
        return false;
      }
      if (
        selectedLgaId !== "all" &&
        lgaIdForResult(lgas, r.lga_id, r.ward_id).toLowerCase() !==
          selectedLgaId.toLowerCase()
      ) {
        return false;
      }
      if (selectedWardId !== "all" && r.ward_id !== selectedWardId) {
        return false;
      }
      return true;
    });
  }, [
    contestScopedResults,
    selectedContestId,
    selectedLgaId,
    selectedWardId,
    lgas,
  ]);

  // Current Contest Object & Tracked Parties List
  const currentContest = contests.find((c) => c.id === selectedContestId);
  const activeContestIsSelected =
    !!(activeContest && currentContest?.id === activeContest.id);
  const trackedParties = currentContest?.tracked_parties ?? [];

  // Dynamically default party comparison selectors when trackedParties loads
  useEffect(() => {
    if (trackedParties.length >= 2) {
      if (!comparePartyA || !trackedParties.includes(comparePartyA)) {
        setComparePartyA(trackedParties[0]);
      }
      if (!comparePartyB || !trackedParties.includes(comparePartyB)) {
        setComparePartyB(trackedParties[1]);
      }
    } else if (trackedParties.length === 1) {
      setComparePartyA(trackedParties[0]);
      setComparePartyB(trackedParties[0]);
    }
  }, [trackedParties, comparePartyA, comparePartyB]);

  // Aggregated Official Party Totals & Operational Breakdown
  const aggregates = useMemo(() => {
    const partyTotals: Record<string, number> = {};
    for (const p of trackedParties) {
      partyTotals[p.toLowerCase()] = 0;
    }

    let totalOfficialVotes = 0;

    for (const r of officialApprovedResults) {
      for (const pr of r.results) {
        const partyKey = pr.party.toLowerCase();
        const v = Number(pr.votes) || 0;
        totalOfficialVotes += v;
        partyTotals[partyKey] = (partyTotals[partyKey] || 0) + v;
      }
    }

    // Determine leading party among tracked parties
    let leadingParty = "None";
    let leadingVotes = -1;
    for (const [p, v] of Object.entries(partyTotals)) {
      if (v > leadingVotes && v > 0) {
        leadingVotes = v;
        leadingParty = p.toUpperCase();
      }
    }

    const votesA = partyTotals[comparePartyA.toLowerCase()] || 0;
    const votesB = partyTotals[comparePartyB.toLowerCase()] || 0;
    const marginAB = votesA - votesB;

    const pendingCount = operationalSubmissions.filter(
      (r) => r.status === "submitted" || r.status === "pending_review",
    ).length;
    const approvedCount = officialApprovedResults.length;
    const rejectedCount = operationalSubmissions.filter(
      (r) => r.status === "rejected",
    ).length;
    const clarifyCount = operationalSubmissions.filter(
      (r) => r.status === "clarification_required",
    ).length;
    const reopenedCount = operationalSubmissions.filter(
      (r) => r.status === "reopened",
    ).length;

    let totalPUsInScope = 0;
    if (selectedWardId !== "all") {
      for (const l of scopedLgas) {
        const w = l.wards.find((item) => item.id === selectedWardId);
        if (w) {
          totalPUsInScope = w.pollingUnits.length;
          break;
        }
      }
    } else if (selectedLgaId !== "all") {
      const l = scopedLgas.find((item) => item.id === selectedLgaId);
      if (l) {
        totalPUsInScope = l.wards.reduce(
          (acc, w) => acc + w.pollingUnits.length,
          0,
        );
      }
    } else {
      /*
       * Denominator is the CONTEST scope, not the whole state: with
       * no ward/LGA drill-down chosen the total covers every LGA the
       * active contest spans. `scopedLgas` is the contest-scoped list
       * — the state-wide `lgas` list would wrongly report 4,108.
       */
      totalPUsInScope = scopedLgas.reduce(
        (acc, l) =>
          acc + l.wards.reduce((wAcc, w) => wAcc + w.pollingUnits.length, 0),
        0,
      );
    }

    const reportingPercent =
      totalPUsInScope > 0
        ? ((approvedCount / totalPUsInScope) * 100).toFixed(1)
        : "0.0";

    return {
      totalOfficialVotes,
      partyTotals,
      leadingParty,
      leadingVotes,
      votesA,
      votesB,
      marginAB,
      pendingCount,
      approvedCount,
      rejectedCount,
      clarifyCount,
      reopenedCount,
      totalPUsInScope,
      reportingPercent,
    };
  }, [
    officialApprovedResults,
    operationalSubmissions,
    trackedParties,
    comparePartyA,
    comparePartyB,
    scopedLgas,
  ]);

  /*
   * ============================================================
   * RESULT CENTER AGGREGATION LEVEL (contest-driven)
   * ============================================================
   *
   * The result-center cards aggregate at the level the active
   * contest dictates:
   *
   *   state / national contest -> LGA rows (ward rows would be far
   *                               too many at state scale)
   *   LGA-scoped contest       -> Ward rows, plus ONE summary row
   *                               for the whole contest scope
   *   ward-scoped contest      -> Polling-unit rows
   */
  const aggregationLevel: "lga" | "ward" | "pu" = useMemo(() => {
    const scopeType = String(activeContest?.scope_type ?? "");

    if (scopeType === "ward" || scopeType === "polling_unit") return "pu";
    if (!activeContest || contestLgaIds === null) return "lga";
    return "ward";
  }, [activeContest, contestLgaIds]);

  const aggregationTitle =
    aggregationLevel === "lga"
      ? "LGA by LGA Official Results"
      : aggregationLevel === "ward"
        ? "Ward by Ward Official Results"
        : "Polling Unit by Polling Unit Official Results";

  // Chart rows grouped at the contest's aggregation level.
  const levelChartData = useMemo(() => {
    const groupMap = new Map<string, Record<string, unknown>>();

    for (const r of officialApprovedResults) {
      let groupName = r.polling_unit_id || r.ward_id;

      for (const l of lgas) {
        const w = l.wards.find((item) => item.id === r.ward_id);
        if (!w) continue;

        if (aggregationLevel === "lga") {
          groupName = l.name;
        } else if (aggregationLevel === "ward") {
          groupName = `${w.code} — ${w.name}`;
        } else {
          const pu = w.pollingUnits.find(
            (item) => item.id === r.polling_unit_id,
          );
          groupName = pu ? `${pu.code} — ${pu.name}` : r.polling_unit_id;
        }
        break;
      }

      if (!groupMap.has(groupName)) {
        const initObj: Record<string, unknown> = { group: groupName };
        for (const p of trackedParties) {
          initObj[p.toUpperCase()] = 0;
        }
        groupMap.set(groupName, initObj);
      }

      const entry = groupMap.get(groupName)!;
      for (const pr of r.results) {
        const pKey = pr.party.toUpperCase();
        entry[pKey] = ((entry[pKey] as number) || 0) + (Number(pr.votes) || 0);
      }
    }

    return Array.from(groupMap.values());
  }, [officialApprovedResults, lgas, trackedParties, aggregationLevel]);

  /*
   * A contest narrower than the whole state gets ONE summary row
   * covering the entire contest scope, shown above the breakdown.
   */
  const scopeSummaryRow = useMemo(() => {
    if (contestLgaIds === null) return null;

    const row: Record<string, unknown> = {
      group: activeContest ? activeContest.name : "Contest scope",
    };
    for (const p of trackedParties) {
      row[p.toUpperCase()] = 0;
    }

    for (const r of officialApprovedResults) {
      for (const pr of r.results) {
        const pKey = pr.party.toUpperCase();
        row[pKey] = ((row[pKey] as number) || 0) + (Number(pr.votes) || 0);
      }
    }

    return row;
  }, [contestLgaIds, activeContest, officialApprovedResults, trackedParties]);

  // Pie Chart Data
  const pieChartData = useMemo(() => {
    return Object.entries(aggregates.partyTotals).map(([pKey, val]) => ({
      name: pKey.toUpperCase(),
      value: val,
    }));
  }, [aggregates.partyTotals]);

  // Dynamic Party Colors map
  const getPartyColor = (partyKey: string) => {
    const found = allParties.find(
      (p) =>
        p.id === partyKey.toLowerCase() ||
        p.acronym.toLowerCase() === partyKey.toLowerCase(),
    );
    if (found?.color) return found.color;
    if (partyKey.toLowerCase() === "apc") return "#1B4F72";
    if (partyKey.toLowerCase() === "pdp") return "#27AE60";
    if (partyKey.toLowerCase() === "lp") return "#D35400";
    if (partyKey.toLowerCase() === "apga") return "#8E44AD";
    if (partyKey.toLowerCase() === "adc") return "#F39C12";
    return "#34495E";
  };

  const handleSaveCorrection = async () => {
    if (!editingResult || !profile) return;
    setSavingEdit(true);

    try {
      await correctElectionResult({
        resultDocId: editingResult.id,
        newResults: editFormResults,
        adminUserId: profile.id || "admin",
        reason: editReason,
        existingDoc: editingResult,
        actorName: profile.full_name || null,
        actorRole: profile.access_role || null,
      });

      setEditingResult(null);
      setEditReason("");
    } catch (err) {
      console.error("Failed to correct election result:", err);
      notify.error("Failed to save correction. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  if (accessLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-apc-primary" />
        <span className="text-sm text-gray-500">
          Connecting to live contest results engine...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Toast Alert Container */}
      <div className="fixed bottom-5 right-5 z-50 space-y-3 max-w-sm w-full pointer-events-none">
        {toastAlerts.map((a) => (
          <div
            key={a.id}
            className="bg-white border-2 border-apc-primary rounded-xl shadow-xl p-4 pointer-events-auto animate-in slide-in-from-bottom-5 duration-300"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-apc-primary font-bold text-sm">
                <Bell className="h-4 w-4 animate-bounce" />
                <span>New Official Result Approved</span>
              </div>
              <button
                onClick={() =>
                  setToastAlerts((prev) =>
                    prev.filter((item) => item.id !== a.id),
                  )
                }
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-1 text-xs font-semibold text-gray-900">
              {a.puName}
            </p>
            <p className="text-xs text-gray-500">
              {a.wardName} · {a.lgaName}
            </p>

            <div className="mt-2 grid grid-cols-3 gap-2 bg-gray-50 p-2 rounded-lg text-center text-xs font-semibold">
              {a.results.map((r) => (
                <div key={r.party}>
                  <span className="text-gray-500 uppercase">{r.party}: </span>
                  <span className="text-gray-900">{r.votes}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {listenerError && (
        <div className="p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>{listenerError}</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 font-bold"
          >
            Refresh Page
          </button>
        </div>
      )}

      {/* Master election mode indicator (Issue: election mode must gate activity) */}
      {!electionModeLoading && !electionMode && (
        <div className="p-4 bg-gray-100 text-gray-700 border border-gray-300 rounded-xl flex items-start gap-2 text-xs font-semibold">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-gray-500" />
          <span>
            <strong>Election mode is OFF.</strong> Election activity is paused.
            Approved results stay readable below, but result corrections are
            disabled until an administrator turns election mode back on.
          </span>
        </div>
      )}

      {/* Contest Selector & Specs Header (Spec Section 40) */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <BackToDashboardLink />
          <div className="flex items-center gap-2 text-apc-primary font-semibold text-xs tracking-wide uppercase mb-1 mt-2">
            <Vote className="w-4 h-4" />
            <span>CONTEST-AWARE ELECTION DASHBOARD</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Official Results & Operational Collation
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Official totals are calculated strictly from{" "}
            <span className="font-bold text-emerald-700">APPROVED</span>{" "}
            results.
          </p>
        </div>

        {/* Global Selectors */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 bg-gray-50 p-2 rounded-xl border border-gray-200 max-w-full min-w-0">
            <Layers className="w-4 h-4 text-gray-500 shrink-0" />
            <select
              value={selectedCycleId}
              onChange={(e) => setSelectedCycleId(e.target.value)}
              className="text-xs font-bold text-gray-900 bg-transparent border-0 focus:ring-0 cursor-pointer truncate max-w-[160px] sm:max-w-xs"
            >
              <option value="all">All Election Cycles</option>
              {cycles.map((cy) => (
                <option key={cy.id} value={cy.id}>
                  {cy.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-apc-light/40 p-2 rounded-xl border border-apc-primary/30 max-w-full min-w-0">
            <Vote className="w-4 h-4 text-apc-primary shrink-0" />
            <select
              value={selectedContestId}
              onChange={(e) => setSelectedContestId(e.target.value)}
              className="text-xs font-bold text-apc-primary bg-transparent border-0 focus:ring-0 cursor-pointer truncate max-w-[160px] sm:max-w-xs"
            >
              <option value="all">All Open Contests</option>
              {contests.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Active contest scope banner */}
      {activeContest && (
        <div className="p-3 bg-apc-light/50 border border-apc-primary/20 rounded-xl flex flex-wrap items-center gap-2 text-xs">
          <Lock className="h-3.5 w-3.5 text-apc-primary shrink-0" />
          <span className="font-semibold text-apc-primary">
            Active contest:
          </span>
          <span className="font-bold text-gray-900">{activeContest.name}</span>
          <span className="text-gray-500">
            · Scope: {describeContestScope(activeContest, allLgas)}
          </span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="text-xs font-bold text-gray-700">
            Geographic Filter:
          </span>
          <select
            value={selectedLgaId}
            onChange={(e) => {
              setSelectedLgaId(e.target.value);
              setSelectedWardId("all");
            }}
            disabled={lgaFilterLocked}
            title={
              lgaFilterLocked
                ? "Locked to the active contest's LGA"
                : undefined
            }
            className="px-3 py-1.5 border rounded-lg text-xs font-semibold bg-gray-50 max-w-[140px] sm:max-w-[180px] truncate disabled:bg-gray-100"
          >
            {/*
             * A single-LGA contest has no "all" option at all — the
             * selector is LOCKED to the contest's LGA. A multi-LGA
             * contest may widen to "all in scope", never beyond the
             * contest's LGA set.
             */}
            {!lgaFilterLocked && (
              <option value="all">
                {contestLgaIds ? "All In Scope" : "All LGAs"}
              </option>
            )}
            {scopedLgas.map((lga) => (
              <option key={lga.id} value={lga.id}>
                {lga.name}
              </option>
            ))}
          </select>

          <select
            value={selectedWardId}
            onChange={(e) => setSelectedWardId(e.target.value)}
            disabled={selectedLgaId === "all"}
            className="px-3 py-1.5 border rounded-lg text-xs font-semibold bg-gray-50 disabled:bg-gray-100 max-w-[150px] sm:max-w-[220px] truncate"
          >
            <option value="all">All Wards</option>
            {selectedLgaId !== "all" &&
              scopedLgas
                .find((l) => l.id === selectedLgaId)
                ?.wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
          </select>
        </div>

        {/* Party Comparison Selector (Spec Sec 38) */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-lg border text-xs max-w-full">
          <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="font-bold text-slate-700">Compare Parties:</span>
          <select
            value={comparePartyA}
            onChange={(e) => setComparePartyA(e.target.value)}
            disabled={trackedParties.length === 0}
            className="px-2 py-1 border rounded bg-white font-bold uppercase disabled:bg-gray-100 max-w-[90px] truncate"
          >
            {trackedParties.length === 0 ? (
              <option value="">N/A</option>
            ) : (
              trackedParties.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))
            )}
          </select>
          <span className="text-slate-400 font-bold">vs</span>
          <select
            value={comparePartyB}
            onChange={(e) => setComparePartyB(e.target.value)}
            disabled={trackedParties.length === 0}
            className="px-2 py-1 border rounded bg-white font-bold uppercase disabled:bg-gray-100 max-w-[90px] truncate"
          >
            {trackedParties.length === 0 ? (
              <option value="">N/A</option>
            ) : (
              trackedParties.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Official vs Operational Status Metrics Cards (Spec Section 41 & 42) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-emerald-50/60 border-emerald-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                  Official Approved PUs
                </p>
                <p className="text-3xl font-bold text-emerald-900 mt-1">
                  {aggregates.approvedCount} / {aggregates.totalPUsInScope}
                </p>
                <p className="text-xs text-emerald-700 mt-1 font-medium">
                  {aggregates.reportingPercent}% Official Coverage
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-600 shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Total Official Votes
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {aggregates.totalOfficialVotes.toLocaleString()}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Leading:{" "}
                  <span className="font-bold text-apc-primary">
                    {aggregates.leadingParty}
                  </span>
                </p>
              </div>
              <Upload className="h-8 w-8 text-apc-primary shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {comparePartyA.toUpperCase()} vs {comparePartyB.toUpperCase()}{" "}
                Margin
              </p>
              <p
                className={`text-3xl font-bold mt-1 ${
                  aggregates.marginAB >= 0 ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {aggregates.marginAB >= 0
                  ? `+${aggregates.marginAB.toLocaleString()}`
                  : aggregates.marginAB.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {comparePartyA.toUpperCase()}:{" "}
                {aggregates.votesA.toLocaleString()} |{" "}
                {comparePartyB.toUpperCase()}:{" "}
                {aggregates.votesB.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Operational Status Summary */}
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
              Operational Submissions Breakdown
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <div className="bg-white p-2 rounded border text-amber-700">
                Pending: {aggregates.pendingCount}
              </div>
              <div className="bg-white p-2 rounded border text-red-700">
                Rejected: {aggregates.rejectedCount}
              </div>
              <div className="bg-white p-2 rounded border text-amber-800">
                Clarify: {aggregates.clarifyCount}
              </div>
              <div className="bg-white p-2 rounded border text-purple-800">
                Reopened: {aggregates.reopenedCount}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dynamic Party Totals Breakdown Bar */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base font-bold text-slate-900">
            Official Approved Party Totals ({trackedParties.length} Tracked
            Parties)
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          {trackedParties.length === 0 ? (
            <div className="p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs font-semibold">
              No tracked parties configured for this contest. Contact the
              election administrator.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {trackedParties.map((p) => {
                const pKey = p.toLowerCase();
                const v = aggregates.partyTotals[pKey] || 0;
                const pColor = getPartyColor(pKey);

                return (
                  <div
                    key={p}
                    className="p-3 rounded-xl border flex flex-col items-center text-center space-y-1"
                    style={{ borderLeftWidth: "4px", borderLeftColor: pColor }}
                  >
                    <span className="text-xs font-bold uppercase text-slate-500">
                      {p}
                    </span>
                    <span className="text-xl font-bold font-mono text-slate-900">
                      {v.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{aggregationTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {scopeSummaryRow && (
              <div className="mb-4 overflow-x-auto rounded-xl border border-gray-100 bg-gray-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Contest scope summary
                </p>

                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400">
                      <th className="py-1 pr-3 font-semibold">Scope</th>
                      {trackedParties.map((p) => (
                        <th key={p} className="py-1 pr-3 font-semibold">
                          {p.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td className="py-1 pr-3 font-semibold text-gray-900">
                        {String(scopeSummaryRow.group)}
                      </td>
                      {trackedParties.map((p) => (
                        <td
                          key={p}
                          className="py-1 pr-3 font-mono font-semibold text-gray-900"
                        >
                          {Number(
                            scopeSummaryRow[p.toUpperCase()] ?? 0,
                          ).toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="h-80">
              {levelChartData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  No approved election results available in this scope.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={levelChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="group" />
                    <YAxis />
                    <Tooltip />
                    {trackedParties.map((p) => (
                      <Bar
                        key={p}
                        dataKey={p.toUpperCase()}
                        fill={getPartyColor(p)}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Official Vote Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              {aggregates.totalOfficialVotes === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  No official votes recorded yet in this scope.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="value"
                      label
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={getPartyColor(entry.name)}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submitted Polling Unit Results & Inspection Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              Polling Unit Results ({operationalSubmissions.length})
            </CardTitle>
            {!isAdmin && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                <Lock className="h-3 w-3" /> Read-Only View
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            {operationalSubmissions.length === 0 ? (
              <p className="text-center py-8 text-sm text-gray-500">
                No polling unit election results available in this scope yet.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                    <th className="text-left py-3 px-4">Polling Unit / Ward</th>
                    <th className="text-left py-3 px-4">Contest</th>
                    <th className="text-center py-3 px-4">Status</th>
                    <th className="text-center py-3 px-4">Form EC8 Evidence</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {operationalSubmissions.map((r) => {
                    const contestObj = contests.find(
                      (c) => c.id === r.contest_id,
                    );

                    return (
                      <tr key={r.id} className="hover:bg-gray-50/80">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-gray-900">
                            {r.polling_unit_id}
                          </p>
                          <p className="text-xs text-gray-500">
                            Ward: {r.ward_id}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-xs text-emerald-800">
                            {contestObj?.name ||
                              r.contest_id ||
                              "State Contest"}
                          </p>
                        </td>
                        <td className="text-center py-3 px-4">
                          <span
                            className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                              r.status === "approved"
                                ? "bg-emerald-100 text-emerald-800"
                                : r.status === "rejected"
                                  ? "bg-red-100 text-red-800"
                                  : r.status === "clarification_required"
                                    ? "bg-amber-100 text-amber-800"
                                    : r.status === "reopened"
                                      ? "bg-purple-100 text-purple-800"
                                      : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="text-center py-3 px-4">
                          {r.cloudinary_url ? (
                            <button
                              onClick={() => setInspectResult(r)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-apc-primary hover:underline"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Inspect EC8
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">
                              No Image
                            </span>
                          )}
                        </td>
                        <td className="text-right py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            {r.history && r.history.length > 0 && (
                              <button
                                onClick={() => setInspectResult(r)}
                                title="View audit history"
                                className="p-1 text-gray-400 hover:text-apc-primary"
                              >
                                <History className="h-4 w-4" />
                              </button>
                            )}

                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setEditingResult(r);
                                  setEditFormResults([...r.results]);
                                  setEditReason("");
                                }}
                                disabled={!electionMode}
                                title={
                                  electionMode
                                    ? "Correct this result"
                                    : "Election mode is off"
                                }
                                className="px-2.5 py-1 text-xs font-semibold rounded bg-apc-primary/10 text-apc-primary hover:bg-apc-primary hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-apc-primary/10 disabled:hover:text-apc-primary"
                              >
                                Correct
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Inspect EC8 Image & Audit History Modal */}
      {inspectResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="bg-apc-primary text-white p-5 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-lg">Form EC8 Result Evidence</h2>
                <p className="text-xs text-white/80">
                  PU: {inspectResult.polling_unit_id} · Ward:{" "}
                  {inspectResult.ward_id}
                </p>
              </div>
              <button
                onClick={() => setInspectResult(null)}
                className="p-1 hover:bg-white/10 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Evidence Image */}
              {inspectResult.cloudinary_url ? (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Official Form EC8 Result Sheet Image
                  </p>
                  <div className="rounded-xl border bg-gray-50 overflow-hidden flex items-center justify-center p-2 min-h-[250px]">
                    <img
                      src={inspectResult.cloudinary_url}
                      alt="Form EC8 Evidence"
                      className="max-h-[350px] object-contain rounded"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-dashed text-center text-sm text-gray-500">
                  No Form EC8 photo evidence was attached to this submission.
                </div>
              )}

              {/* Audit History */}
              {inspectResult.history && inspectResult.history.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="font-bold text-sm text-gray-900 mb-3 flex items-center gap-1.5">
                    <History className="h-4 w-4 text-apc-primary" />
                    Correction Audit History
                  </h3>
                  <div className="space-y-3">
                    {inspectResult.history.map((h, i) => (
                      <div
                        key={i}
                        className="bg-gray-50 p-3 rounded-lg border text-xs space-y-1"
                      >
                        <p className="font-semibold text-gray-800">
                          Action: {h.action} | Actor: {h.edited_by}
                        </p>
                        <p className="text-gray-500">
                          Reason / Notes:{" "}
                          {h.notes || h.reason || "None specified"}
                        </p>
                        <p className="text-gray-400">
                          Timestamp: {String(h.edited_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t px-6 py-3 bg-gray-50 flex justify-end">
              <button
                onClick={() => setInspectResult(null)}
                className="px-4 py-2 text-sm font-semibold rounded-lg border bg-white text-gray-700 hover:bg-gray-100"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Correction Modal */}
      {editingResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-apc-primary text-white p-5 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-lg">Correct Election Result</h2>
                <p className="text-xs text-white/80">
                  PU: {editingResult.polling_unit_id}
                </p>
              </div>
              <button
                onClick={() => setEditingResult(null)}
                className="p-1 hover:bg-white/10 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-500">
                Correct party vote counts against the submitted Form EC8 photo
                evidence. All corrections will be recorded in the audit trail.
              </p>

              <div className="space-y-3">
                {editFormResults.map((pr, idx) => (
                  <div
                    key={pr.party}
                    className="flex items-center justify-between gap-4"
                  >
                    <label className="text-sm font-semibold text-gray-700 uppercase">
                      {pr.party} Votes
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={pr.votes}
                      onChange={(e) => {
                        const updated = [...editFormResults];
                        updated[idx].votes = parseInt(e.target.value) || 0;
                        setEditFormResults(updated);
                      }}
                      className="w-28 px-3 py-2 border rounded-lg text-sm text-right font-mono font-bold"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Reason / Audit Note
                </label>
                <textarea
                  rows={2}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. Corrected typo in PDP vote count per EC8 sheet"
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="border-t px-6 py-4 bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => setEditingResult(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCorrection}
                disabled={savingEdit || !electionMode}
                title={
                  electionMode ? "Save correction" : "Election mode is off"
                }
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-apc-primary text-white hover:bg-apc-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingEdit
                  ? "Saving..."
                  : electionMode
                    ? "Save Correction"
                    : "Election Mode Off"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
