import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  Query,
  Unsubscribe,
} from "firebase/firestore";

import { db } from "./config";
import {
  INEC_2027_POLITICAL_PARTIES,
  DEFAULT_ELECTION_CYCLE_2027,
  DEFAULT_CONTESTS_2027,
} from "./election-seed";
import type {
  ElectionCycle,
  ElectionContest,
  PoliticalParty,
  ElectionCandidate,
  ElectionSettings,
  ContestType,
  ContestScopeType,
} from "@/types";

/*
 * ============================================================
 * ELECTION RESULTS TYPES
 * ============================================================
 */

export type ElectionResultStatus =
  | "submitted"
  | "pending_review"
  | "approved"
  | "rejected"
  | "clarification_required"
  | "reopened";

export interface ElectionPartyResult {
  party: string;
  votes: number;
}

export interface ElectionResultHistory {
  edited_by: string;
  edited_at: unknown;
  action:
    | "create"
    | "correct"
    | "review_approve"
    | "review_reject"
    | "review_clarify"
    | "reopen";
  old_results?: ElectionPartyResult[];
  new_results?: ElectionPartyResult[];
  old_status?: ElectionResultStatus;
  new_status?: ElectionResultStatus;
  notes?: string;
  reason?: string;
}

export interface ElectionResultDoc {
  id: string;
  election_cycle_id: string;
  contest_id: string;
  contest_type: ContestType;
  contest_scope: {
    scope_type: ContestScopeType;
    scope_id: string;
  };
  state_id?: string | null;
  senatorial_zone_id?: string | null;
  lga_id: string;
  ward_id: string;
  polling_unit_id: string;
  results: ElectionPartyResult[];
  submitted_by: string;
  status: ElectionResultStatus;
  review_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: unknown;
  verified: boolean;
  cloudinary_url?: string | null;
  cloudinary_public_id?: string | null;
  history?: ElectionResultHistory[];
  created_at?: unknown;
  updated_at?: unknown;
}

/*
 * ============================================================
 * POLLING UNIT REPORT TYPES
 * ============================================================
 */

export interface PUReportDoc {
  id: string;
  ward_id: string;
  polling_unit_id: string;
  submitted_by: string;
  report_type: "opening" | "turnout" | "conduct" | "closing" | "general";
  title: string;
  content: string;
  cloudinary_url?: string | null;
  status: "submitted" | "under_review" | "acknowledged";
  created_at?: unknown;
}

/*
 * ============================================================
 * ELECTION INCIDENT TYPES
 * ============================================================
 */

export interface ElectionIncidentDoc {
  id: string;
  ward_id: string;
  polling_unit_id?: string | null;
  incident_type:
    | "ballot_snatching"
    | "violence"
    | "bavas_malfunction"
    | "late_arrival"
    | "vote_buying"
    | "other";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  reported_by: string;
  cloudinary_url?: string | null;
  status: "reported" | "investigating" | "resolved" | "dismissed";
  created_at?: unknown;
}

/*
 * ============================================================
 * SUBMIT ELECTION RESULT WITH FORM EC8 EVIDENCE
 * ============================================================
 */

/*
 * ============================================================
 * ELECTION SETTINGS & SEEDING SERVICES
 * ============================================================
 */

/*
 * The election engine keeps exactly one settings document, so the
 * document id is a local constant.
 */
export const ELECTION_SETTINGS_DOC_ID = "default";

export async function getElectionSettings(): Promise<ElectionSettings | null> {
  const docRef = doc(db, "election_settings", ELECTION_SETTINGS_DOC_ID);
  const snap = await getDoc(docRef);

  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as ElectionSettings;
  }

  // Return fallback read-only settings without attempting admin writes
  return {
    active_election_cycle_id: DEFAULT_ELECTION_CYCLE_2027.id,
    active_contest_id: DEFAULT_CONTESTS_2027[0].id,
    election_mode_enabled: true,
  };
}

export function subscribeToElectionSettings(
  onData: (settings: ElectionSettings | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const docRef = doc(db, "election_settings", ELECTION_SETTINGS_DOC_ID);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        onData({ id: snap.id, ...snap.data() } as ElectionSettings);
      } else {
        onData(null);
      }
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function setActiveCollationContest(data: {
  activeCycleId: string;
  activeContestId: string;
  userId: string;
}) {
  const docRef = doc(db, "election_settings", ELECTION_SETTINGS_DOC_ID);
  await setDoc(
    docRef,
    {
      active_election_cycle_id: data.activeCycleId,
      active_contest_id: data.activeContestId,
      updated_by: data.userId,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

/*
 * Master election switch. Persisted on the single election_settings
 * document so both the UI (navigation + action buttons) and
 * `electionModeEnabled()` in firestore.rules read the same flag.
 */
export async function setElectionMode(enabled: boolean, userId: string) {
  const docRef = doc(db, "election_settings", ELECTION_SETTINGS_DOC_ID);
  await setDoc(
    docRef,
    {
      election_mode_enabled: enabled,
      updated_by: userId,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

/*
 * ============================================================
 * POLITICAL PARTY MASTER SERVICES
 * ============================================================
 */

export async function getPoliticalParties(): Promise<PoliticalParty[]> {
  const snap = await getDocs(collection(db, "political_parties"));
  if (snap.empty) {
    return INEC_2027_POLITICAL_PARTIES;
  }
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data() } as PoliticalParty)
  );
}

export async function seedDefaultPoliticalParties() {
  for (const party of INEC_2027_POLITICAL_PARTIES) {
    const pRef = doc(db, "political_parties", party.id);
    await setDoc(
      pRef,
      {
        ...party,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );
  }
}

export async function createPoliticalParty(party: Omit<PoliticalParty, "id"> & { id: string }) {
  const pRef = doc(db, "political_parties", party.id);
  await setDoc(pRef, {
    ...party,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

/*
 * Update an existing political party.
 *
 * The document id (and therefore the party identity) is immutable; only
 * the descriptive fields are accepted.
 */
export async function updatePoliticalParty(
  partyId: string,
  data: Partial<Omit<PoliticalParty, "id" | "created_at" | "updated_at">>,
) {
  const pRef = doc(db, "political_parties", partyId);
  await updateDoc(pRef, {
    ...data,
    updated_at: serverTimestamp(),
  });
}

export async function deletePoliticalParty(partyId: string) {
  await deleteDoc(doc(db, "political_parties", partyId));
}

/*
 * ============================================================
 * ELECTION CYCLES SERVICES
 * ============================================================
 */

export async function getElectionCycles(): Promise<ElectionCycle[]> {
  const snap = await getDocs(collection(db, "election_cycles"));

  if (snap.empty) {
    return [
      {
        ...DEFAULT_ELECTION_CYCLE_2027,
        created_by: "system",
      },
    ];
  }

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ElectionCycle));
}

export async function createElectionCycle(data: {
  id: string;
  name: string;
  year: number;
  description?: string;
  status: ElectionCycle["status"];
  start_date?: string;
  end_date?: string;
  userId: string;
}) {
  const cycleRef = doc(db, "election_cycles", data.id);
  await setDoc(cycleRef, {
    name: data.name,
    year: data.year,
    description: data.description || "",
    status: data.status,
    start_date: data.start_date || null,
    end_date: data.end_date || null,
    created_by: data.userId,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

export async function updateElectionCycle(
  cycleId: string,
  updates: Partial<ElectionCycle>
) {
  const cycleRef = doc(db, "election_cycles", cycleId);
  await updateDoc(cycleRef, {
    ...updates,
    updated_at: serverTimestamp(),
  });
}

/*
 * ============================================================
 * ELECTION CONTESTS SERVICES
 * ============================================================
 */

export async function getContestsByCycle(
  electionCycleId: string
): Promise<ElectionContest[]> {
  const q = query(
    collection(db, "election_contests"),
    where("election_cycle_id", "==", electionCycleId)
  );
  const snap = await getDocs(q);

  if (snap.empty && electionCycleId === DEFAULT_ELECTION_CYCLE_2027.id) {
    return DEFAULT_CONTESTS_2027.map((item) => ({
      ...item,
      created_by: "system",
    }));
  }

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ElectionContest));
}

export async function getContest(contestId: string): Promise<ElectionContest | null> {
  const snap = await getDoc(doc(db, "election_contests", contestId));
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as ElectionContest;
  }
  // Check default seed fallbacks if Firestore document hasn't been created yet
  const fallback = DEFAULT_CONTESTS_2027.find((c) => c.id === contestId);
  if (fallback) {
    return {
      ...fallback,
      created_by: "system",
    };
  }
  return null;
}

export async function createContest(data: {
  id: string;
  election_cycle_id: string;
  contest_type: ContestType;
  name: string;
  scope_type: ContestScopeType;
  scope_id: string;
  state_id?: string;
  senatorial_zone_id?: string;
  lga_ids?: string[];
  election_date?: string;
  tracked_parties: string[];
  focus_party_id?: string;
  userId: string;
}) {
  const contestRef = doc(db, "election_contests", data.id);
  await setDoc(contestRef, {
    election_cycle_id: data.election_cycle_id,
    contest_type: data.contest_type,
    name: data.name,
    scope_type: data.scope_type,
    scope_id: data.scope_id,
    state_id: data.state_id || null,
    senatorial_zone_id: data.senatorial_zone_id || null,
    lga_ids: data.lga_ids || [],
    election_date: data.election_date || null,
    status: "OPEN",
    collation_status: "IN_PROGRESS",
    tracked_parties: data.tracked_parties,
    focus_party_id: data.focus_party_id || "apc",
    created_by: data.userId,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

export async function updateContest(
  contestId: string,
  updates: Partial<ElectionContest>
) {
  const contestRef = doc(db, "election_contests", contestId);
  await updateDoc(contestRef, {
    ...updates,
    updated_at: serverTimestamp(),
  });
}

/*
 * ============================================================
 * CANDIDATES SERVICES
 * ============================================================
 */

export async function getCandidatesByContest(contestId: string): Promise<ElectionCandidate[]> {
  const q = query(
    collection(db, "election_candidates"),
    where("contest_id", "==", contestId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ElectionCandidate));
}

export async function createCandidate(data: Omit<ElectionCandidate, "id">) {
  const ref = await addDoc(collection(db, "election_candidates"), {
    ...data,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  return ref.id;
}

/*
 * ============================================================
 * SUBMIT ELECTION RESULT WITH FORM EC8 EVIDENCE (CONTEST-AWARE)
 * ============================================================
 */

export async function submitElectionResultWithEvidence(data: {
  electionCycleId: string;
  contestId: string;
  contestType: ContestType;
  contestScope: { scope_type: ContestScopeType; scope_id: string };
  lgaId: string;
  wardId: string;
  pollingUnitId: string;
  stateId?: string | null;
  senatorialZoneId?: string | null;
  results: ElectionPartyResult[];
  userId: string;
  cloudinaryUrl?: string | null;
  cloudinaryPublicId?: string | null;
}) {
  if (!data.cloudinaryUrl) {
    throw new Error(
      "Form EC8 photo evidence is mandatory for result submission.",
    );
  }

  // Fetch contest to verify status server-side before accepting submission
  const contest = await getContest(data.contestId);
  if (!contest) {
    throw new Error("Target election contest not found.");
  }
  if (contest.status !== "OPEN") {
    throw new Error(`Cannot submit result: Contest '${contest.name}' is currently ${contest.status} and not OPEN for result submission.`);
  }

  // Deterministic ID across Contest + Polling Unit as required by Spec Section 15
  const resultDocId = `${data.contestId}__${data.pollingUnitId}`;
  const resultRef = doc(db, "election_results", resultDocId);

  const initialHistory: ElectionResultHistory = {
    edited_by: data.userId,
    edited_at: new Date().toISOString(),
    action: "create",
    new_results: data.results,
    new_status: "submitted",
    notes: `Initial result submission for contest ${data.contestId} with Form EC8 evidence`,
  };

  await setDoc(resultRef, {
    election_cycle_id: data.electionCycleId,
    contest_id: data.contestId,
    contest_type: data.contestType,
    contest_scope: data.contestScope,
    state_id: data.stateId || null,
    senatorial_zone_id: data.senatorialZoneId || null,
    lga_id: data.lgaId,
    ward_id: data.wardId,
    polling_unit_id: data.pollingUnitId,
    results: data.results,
    submitted_by: data.userId,
    status: "submitted",
    verified: false,
    cloudinary_url: data.cloudinaryUrl || null,
    cloudinary_public_id: data.cloudinaryPublicId || null,
    history: [initialHistory],
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

/*
 * ============================================================
 * ELECTION OFFICER REVIEW & ACTION (APPROVE / REJECT / CLARIFY / REOPEN)
 * ============================================================
 */

export async function reviewElectionResult(data: {
  resultDocId: string;
  officerUserId: string;
  action: "approve" | "reject" | "clarify" | "reopen";
  notes?: string;
  existingDoc: ElectionResultDoc;
}) {
  const resultRef = doc(db, "election_results", data.resultDocId);

  let newStatus: ElectionResultStatus = "pending_review";
  let historyAction: ElectionResultHistory["action"] = "review_approve";

  if (data.action === "approve") {
    newStatus = "approved";
    historyAction = "review_approve";
  } else if (data.action === "reject") {
    newStatus = "rejected";
    historyAction = "review_reject";
  } else if (data.action === "clarify") {
    newStatus = "clarification_required";
    historyAction = "review_clarify";
  } else if (data.action === "reopen") {
    newStatus = "reopened";
    historyAction = "reopen";
  }

  const historyItem: ElectionResultHistory = {
    edited_by: data.officerUserId,
    edited_at: new Date().toISOString(),
    action: historyAction,
    old_status: data.existingDoc.status,
    new_status: newStatus,
    notes: data.notes || `Result marked as ${newStatus}`,
  };

  const updatedHistory = [...(data.existingDoc.history || []), historyItem];

  await updateDoc(resultRef, {
    status: newStatus,
    verified: newStatus === "approved",
    reviewed_by: data.officerUserId,
    review_notes: data.notes || null,
    reviewed_at: serverTimestamp(),
    history: updatedHistory,
    updated_at: serverTimestamp(),
  });
}

/*
 * ============================================================
 * ADMIN CORRECT ELECTION RESULT (WITH AUDIT HISTORY)
 * ============================================================
 */

export async function correctElectionResult(data: {
  resultDocId: string;
  newResults: ElectionPartyResult[];
  adminUserId: string;
  reason?: string;
  existingDoc: ElectionResultDoc;
}) {
  const resultRef = doc(db, "election_results", data.resultDocId);

  // An Admin correction must NOT automatically approve or keep a result approved.
  // If an approved result is edited, it must revert to 'pending_review' for Election Officer verification.
  const newStatus: ElectionResultStatus = "pending_review";

  const historyItem: ElectionResultHistory = {
    edited_by: data.adminUserId,
    edited_at: new Date().toISOString(),
    action: "correct",
    old_results: data.existingDoc.results,
    new_results: data.newResults,
    old_status: data.existingDoc.status,
    new_status: newStatus,
    reason:
      data.reason || "Administrative correction against submitted EC8 evidence",
  };

  const updatedHistory = [...(data.existingDoc.history || []), historyItem];

  await updateDoc(resultRef, {
    results: data.newResults,
    status: newStatus,
    verified: false,
    history: updatedHistory,
    updated_at: serverTimestamp(),
  });
}

/*
 * ============================================================
 * REAL-TIME ELECTION RESULTS SUBSCRIBER
 * ============================================================
 *
 * `scopeConstraint` mirrors the Firestore read rule
 * (`canReadElectionResult`): admin / election officer read anything
 * within the active contest, everyone else is limited to the ward and
 * polling unit their account and assignments cover.
 *
 * A coordinator can cover several wards at once (for example an LGA
 * coordinator), so additional constraints may be supplied. Each is
 * queried separately — a query the rules can prove — and the snapshots
 * are merged by document id.
 */

export interface ElectionResultScopeConstraint {
  contest_id?: string;
  ward_id?: string;
  polling_unit_id?: string;
}

function buildResultQuery(
  scopeConstraint?: ElectionResultScopeConstraint,
): Query {
  if (
    scopeConstraint?.contest_id &&
    scopeConstraint?.ward_id &&
    scopeConstraint?.polling_unit_id
  ) {
    return query(
      collection(db, "election_results"),
      where("contest_id", "==", scopeConstraint.contest_id),
      where("ward_id", "==", scopeConstraint.ward_id),
      where("polling_unit_id", "==", scopeConstraint.polling_unit_id),
    );
  }

  if (scopeConstraint?.contest_id && scopeConstraint?.ward_id) {
    return query(
      collection(db, "election_results"),
      where("contest_id", "==", scopeConstraint.contest_id),
      where("ward_id", "==", scopeConstraint.ward_id),
    );
  }

  if (scopeConstraint?.contest_id) {
    return query(
      collection(db, "election_results"),
      where("contest_id", "==", scopeConstraint.contest_id),
    );
  }

  if (scopeConstraint?.ward_id && scopeConstraint?.polling_unit_id) {
    return query(
      collection(db, "election_results"),
      where("ward_id", "==", scopeConstraint.ward_id),
      where("polling_unit_id", "==", scopeConstraint.polling_unit_id),
    );
  }

  if (scopeConstraint?.ward_id) {
    return query(
      collection(db, "election_results"),
      where("ward_id", "==", scopeConstraint.ward_id),
    );
  }

  if (scopeConstraint?.polling_unit_id) {
    return query(
      collection(db, "election_results"),
      where("polling_unit_id", "==", scopeConstraint.polling_unit_id),
    );
  }

  return query(collection(db, "election_results"));
}

export function subscribeToElectionResults(
  onData: (results: ElectionResultDoc[], isInitialLoad: boolean) => void,
  onError?: (err: Error) => void,
  scopeConstraint?: ElectionResultScopeConstraint,
  additionalConstraints?: ElectionResultScopeConstraint[],
): Unsubscribe {
  const constraints = [
    scopeConstraint,
    ...(additionalConstraints ?? []),
  ].filter(Boolean) as ElectionResultScopeConstraint[];

  /*
   * Single query: keep the original one-listener behaviour so callers
   * that pass nothing continue to read the whole collection.
   */
  if (constraints.length <= 1) {
    let isFirstSnapshot = true;

    return onSnapshot(
      buildResultQuery(constraints[0]),
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ElectionResultDoc[];

        onData(docs, isFirstSnapshot);
        isFirstSnapshot = false;
      },
      (err) => {
        console.error("Error in election results listener:", err);
        if (onError) onError(err);
      },
    );
  }

  /*
   * Multiple queries: merge every snapshot by document id and only
   * report "initial load" once every listener has answered.
   */
  const merged = new Map<string, ElectionResultDoc>();
  const loaded = new Array<boolean>(constraints.length).fill(false);
  let deliveredInitialLoad = false;

  const emit = () => {
    const docs = Array.from(merged.values());
    const allLoaded = loaded.every(Boolean);
    const isInitialLoad = !deliveredInitialLoad && allLoaded;

    if (isInitialLoad) deliveredInitialLoad = true;

    onData(docs, isInitialLoad);
  };

  const unsubscribes = constraints.map((constraint, index) =>
    onSnapshot(
      buildResultQuery(constraint),
      (snapshot) => {
        for (const d of snapshot.docs) {
          merged.set(d.id, { id: d.id, ...d.data() } as ElectionResultDoc);
        }
        loaded[index] = true;
        emit();
      },
      (err) => {
        console.error("Error in election results listener:", err);
        if (onError) onError(err);
      },
    ),
  );

  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}

/*
 * ============================================================
 * POLLING UNIT REPORTS SERVICE
 * ============================================================
 */

export async function createPUReport(data: {
  ward_id: string;
  polling_unit_id: string;
  submitted_by: string;
  report_type: PUReportDoc["report_type"];
  title: string;
  content: string;
  cloudinary_url?: string | null;
}) {
  const ref = await addDoc(collection(db, "pu_reports"), {
    ...data,
    status: "submitted",
    created_at: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeToPUReports(
  onData: (reports: PUReportDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, "pu_reports"));

  return onSnapshot(
    q,
    (snapshot) => {
      const docs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as PUReportDoc[];
      onData(
        docs.sort(
          (first, second) =>
            getTimestampMillis(second.created_at) -
            getTimestampMillis(first.created_at),
        ),
      );
    },
    (err) => {
      console.error("Error in PU reports listener:", err);
      if (onError) onError(err);
    },
  );
}

/*
 * ============================================================
 * ELECTION INCIDENTS SERVICE
 * ============================================================
 */

export async function createElectionIncident(data: {
  ward_id: string;
  polling_unit_id?: string | null;
  incident_type: ElectionIncidentDoc["incident_type"];
  severity: ElectionIncidentDoc["severity"];
  description: string;
  reported_by: string;
  cloudinary_url?: string | null;
}) {
  const ref = await addDoc(collection(db, "election_incidents"), {
    ...data,
    status: "reported",
    created_at: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeToElectionIncidents(
  onData: (incidents: ElectionIncidentDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, "election_incidents"));

  return onSnapshot(
    q,
    (snapshot) => {
      const docs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ElectionIncidentDoc[];
      onData(
        docs.sort(
          (first, second) =>
            getTimestampMillis(second.created_at) -
            getTimestampMillis(first.created_at),
        ),
      );
    },
    (err) => {
      console.error("Error in election incidents listener:", err);
      if (onError) onError(err);
    },
  );
}

function getTimestampMillis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value) {
    const toMillis = (value as { toMillis?: () => number }).toMillis;
    if (typeof toMillis === "function") return toMillis();
  }

  if (typeof value === "string" || typeof value === "number") {
    return new Date(value).getTime();
  }

  return 0;
}
