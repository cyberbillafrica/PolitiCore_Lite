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
  writeBatch,
  Query,
  Unsubscribe,
} from "firebase/firestore";

import { db } from "./config";
import {
  INEC_2027_POLITICAL_PARTIES,
  DEFAULT_ELECTION_CYCLE_2027,
  DEFAULT_CONTESTS_2027,
} from "./election-seed";
import { buildElectionAuditEntry } from "./election-audit";
import {
  contestCoversPollingUnit,
  contestCoversWard,
  deriveLgaIdFromWard,
  isWithinContestScope,
} from "@/lib/election-scope";
import {
  getResultLevel,
  resultLevelMeta,
  type ElectionResultLevel,
} from "@/lib/election-levels";

export { getResultLevel };
export type { ElectionResultLevel };
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
  /** Missing on legacy documents — read through `getResultLevel()`. */
  result_level?: ElectionResultLevel;
  state_id?: string | null;
  senatorial_zone_id?: string | null;
  lga_id: string;
  ward_id: string;
  polling_unit_id: string;
  notes?: string | null;
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

/*
 * Shown on every election surface when election_settings has no
 * active contest set. A fresh deployment starts here — the admin
 * must activate a contest in the election control centre before
 * any operations window opens.
 */
export const NO_ACTIVE_CONTEST_MESSAGE =
  "No active contest — election operations are unavailable.";

/*
 * Round-4 scope enforcement: the ACTIVE CONTEST (and only it) is
 * the submission target. Read straight from the settings document
 * with no seed fallback — an unset active contest means "closed".
 */
async function getStrictActiveContestId(): Promise<string | null> {
  const settingsSnap = await getDoc(
    doc(db, "election_settings", ELECTION_SETTINGS_DOC_ID),
  );

  const contestId = settingsSnap.exists()
    ? ((settingsSnap.data().active_contest_id as string | null) ?? "")
    : "";

  return contestId ? contestId : null;
}

interface SubmissionActor {
  id: string;
  name?: string | null;
  role?: string | null;
}

/*
 * Optional point-in-time actor context passed by pages (the caller's
 * profile). Audit rows snapshot name/role at write time; when absent
 * they fall back to "Unknown member" / "member".
 */
interface ActorContext {
  actorName?: string | null;
  actorRole?: string | null;
}

/*
 * Shared audit-entry builder for result state transitions. The
 * audit entry and the state change always go into the SAME batch so
 * the trail is never missing a step.
 */
function appendResultAuditToBatch(
  batch: ReturnType<typeof writeBatch>,
  data: {
    resultDocId: string;
    action:
      | "result_submitted"
      | "result_approved"
      | "result_rejected"
      | "result_clarification_required"
      | "result_reopened"
      | "result_corrected";
    actor: SubmissionActor;
    previousStatus: string | null;
    newStatus: string | null;
    reason?: string | null;
    snapshot?: Record<string, unknown> | null;
  },
): void {
  batch.set(
    doc(collection(db, "election_audit")),
    buildElectionAuditEntry({
      action: data.action as Parameters<
        typeof buildElectionAuditEntry
      >[0]["action"],
      target_collection: "election_results",
      target_doc_id: data.resultDocId,
      actor_id: data.actor.id,
      actor_name: (data.actor.name ?? "").trim() || "Unknown member",
      actor_role: (data.actor.role ?? "").trim() || "member",
      reason: data.reason ?? null,
      snapshot: data.snapshot ?? null,
      metadata: {
        previous_status: data.previousStatus,
        new_status: data.newStatus,
      },
    }),
  );
}

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
 * Delete a contest permanently.
 *
 * Admin-only by election_contests rules. The active contest pointer
 * on election_settings is the caller's responsibility to reassign —
 * the UI confirms before calling.
 */
export async function deleteContest(contestId: string) {
  const contestRef = doc(db, "election_contests", contestId);
  await deleteDoc(contestRef);
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
  /** Empty string when the level does not use this scope. */
  lgaId: string;
  /** Empty string when the level does not use this scope. */
  wardId: string;
  /** Empty string when the level does not use this scope. */
  pollingUnitId: string;
  stateId?: string | null;
  senatorialZoneId?: string | null;
  /** Defaults to "polling_unit" so existing callers are unchanged. */
  resultLevel?: ElectionResultLevel;
  notes?: string | null;
  results: ElectionPartyResult[];
  userId: string;
  cloudinaryUrl?: string | null;
  cloudinaryPublicId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
}) {
  const level = data.resultLevel ?? "polling_unit";
  const levelMeta = resultLevelMeta(level);

  if (!data.cloudinaryUrl) {
    throw new Error(
      `${levelMeta.formCode} photo evidence is mandatory for result submission.`,
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

  /*
   * Round-4 scope enforcement: the CLIENT may only submit into the
   * ACTIVE contest (election_settings.active_contest_id), read here
   * from the settings document — never from the payload. A client
   * that posts contest_id for any other contest is refused.
   */
  const activeContestId = await getStrictActiveContestId();
  if (!activeContestId) {
    throw new Error(NO_ACTIVE_CONTEST_MESSAGE);
  }
  if (data.contestId !== activeContestId) {
    throw new Error(
      "This contest is not the active one — result submission is only accepted for the active contest.",
    );
  }

  /*
   * The submitted level must sit inside the active contest's
   * geographic scope. The LGA hierarchy comes from the seeded
   * electoral_data document, falling back to the bundled dataset.
   */
  const { getEnuguElectoralData } = await import("./electoral");
  const allLgas = (await getEnuguElectoralData())?.lgas ?? [];
  const derivedWardLgaId = data.wardId
    ? deriveLgaIdFromWard(allLgas, data.wardId)
    : "";
  const scopeLgaId = data.lgaId || derivedWardLgaId;

  if (level === "polling_unit") {
    if (!data.wardId || !data.pollingUnitId) {
      throw new Error("A polling-unit result requires a ward and polling unit.");
    }

    if (
      !isWithinContestScope(contest, { lgaId: scopeLgaId }, allLgas) ||
      !contestCoversWard(contest, scopeLgaId, data.wardId, allLgas) ||
      !contestCoversPollingUnit(
        contest,
        scopeLgaId,
        data.wardId,
        data.pollingUnitId,
        allLgas,
      )
    ) {
      throw new Error(
        "This polling unit is not within the scope of the active contest.",
      );
    }
  } else if (level === "ward") {
    if (!data.wardId) {
      throw new Error("A ward collation requires a ward.");
    }

    if (!contestCoversWard(contest, scopeLgaId, data.wardId, allLgas)) {
      throw new Error(
        "This ward is not within the scope of the active contest.",
      );
    }
  } else if (level === "lga") {
    if (!data.lgaId) {
      throw new Error("An LGA collation requires an LGA.");
    }

    if (!isWithinContestScope(contest, { lgaId: data.lgaId }, allLgas)) {
      throw new Error(
        "This LGA is not within the scope of the active contest.",
      );
    }
  } else {
    if (contest.scope_type !== "state") {
      throw new Error(
        "A state collation (EC8D) is only accepted for a state-wide contest.",
      );
    }

    if (!data.stateId) {
      throw new Error("A state collation requires a state id.");
    }
  }

  /*
   * Deterministic id per level. The `__ward__` / `__lga__` / `__state__`
   * markers keep the new ids from colliding with the legacy
   * `{contest}__{pu}` and `{ward}__{pu}` formats.
   */
  const stateId = data.stateId || contest.state_id || "enugu-state";
  let resultDocId: string;

  switch (level) {
    case "ward":
      resultDocId = `${data.contestId}__ward__${data.wardId}`;
      break;
    case "lga":
      resultDocId = `${data.contestId}__lga__${data.lgaId}`;
      break;
    case "state":
      resultDocId = `${data.contestId}__state__${stateId}`;
      break;
    default:
      resultDocId = `${data.contestId}__${data.pollingUnitId}`;
      break;
  }

  const resultRef = doc(db, "election_results", resultDocId);

  const initialHistory: ElectionResultHistory = {
    edited_by: data.userId,
    edited_at: new Date().toISOString(),
    action: "create",
    new_results: data.results,
    new_status: "submitted",
    notes: `Initial ${levelMeta.entityNoun} result submission for contest ${data.contestId} with ${levelMeta.formCode} evidence`,
  };

  /*
   * Snapshot of the full result payload for the audit trail (the
   * entered state as it was written). serverTimestamp placeholders
   * are represented as null — the audit row records the identity of
   * the documents, their live timestamps live on the result itself.
   */
  const submittedSnapshot = {
    election_cycle_id: data.electionCycleId,
    contest_id: data.contestId,
    contest_type: data.contestType,
    contest_scope: data.contestScope,
    result_level: level,
    state_id: stateId,
    senatorial_zone_id: data.senatorialZoneId || null,
    lga_id:
      level === "state" ? "" : data.lgaId || derivedWardLgaId || "",
    ward_id:
      level === "polling_unit" || level === "ward" ? data.wardId : "",
    polling_unit_id:
      level === "polling_unit" ? data.pollingUnitId : "",
    notes: data.notes?.trim() || null,
    results: data.results,
    submitted_by: data.userId,
    status: "submitted",
    verified: false,
    cloudinary_url: data.cloudinaryUrl || null,
    cloudinary_public_id: data.cloudinaryPublicId || null,
  };

  /*
   * One atomic batch: the result document AND its audit entry are
   * written together, so a submission can never exist without its
   * audit row (or vice versa).
   */
  const batch = writeBatch(db);

  batch.set(resultRef, {
    ...submittedSnapshot,
    history: [initialHistory],
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  appendResultAuditToBatch(batch, {
    resultDocId,
    action: "result_submitted",
    actor: {
      id: data.userId,
      name: data.actorName,
      role: data.actorRole,
    },
    previousStatus: null,
    newStatus: "submitted",
    snapshot: submittedSnapshot,
  });

  await batch.commit();
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
  actorName?: string | null;
  actorRole?: string | null;
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

  /*
   * One atomic batch: the review decision AND its immutable audit
   * entry are written together. Snapshot = the previous state of the
   * result (review actions do not receive the delete-only full
   * snapshot requirement, but carrying the prior state makes the
   * trail complete).
   */
  const auditActionMap = {
    approve: "result_approved",
    reject: "result_rejected",
    clarify: "result_clarification_required",
    reopen: "result_reopened",
  } as const;

  const {
    id: _droppedId,
    ...previousState
  } = data.existingDoc as ElectionResultDoc & Record<string, unknown>;

  const batch = writeBatch(db);

  batch.update(resultRef, {
    status: newStatus,
    verified: newStatus === "approved",
    reviewed_by: data.officerUserId,
    review_notes: data.notes || null,
    reviewed_at: serverTimestamp(),
    history: updatedHistory,
    updated_at: serverTimestamp(),
  });

  appendResultAuditToBatch(batch, {
    resultDocId: data.resultDocId,
    action: auditActionMap[data.action],
    actor: {
      id: data.officerUserId,
      name: data.actorName,
      role: data.actorRole,
    },
    previousStatus: data.existingDoc.status,
    newStatus,
    reason: data.notes || null,
    snapshot: previousState as Record<string, unknown>,
  });

  await batch.commit();
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
  actorName?: string | null;
  actorRole?: string | null;
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

  /*
   * One atomic batch: the correction AND its immutable audit entry
   * ("result_corrected") are written together.
   */
  const {
    id: _droppedId,
    ...previousState
  } = data.existingDoc as ElectionResultDoc & Record<string, unknown>;

  const batch = writeBatch(db);

  batch.update(resultRef, {
    results: data.newResults,
    status: newStatus,
    verified: false,
    history: updatedHistory,
    updated_at: serverTimestamp(),
  });

  appendResultAuditToBatch(batch, {
    resultDocId: data.resultDocId,
    action: "result_corrected",
    actor: {
      id: data.adminUserId,
      name: data.actorName,
      role: data.actorRole,
    },
    previousStatus: data.existingDoc.status,
    newStatus,
    reason:
      data.reason ||
      "Administrative correction against submitted EC8 evidence",
    snapshot: previousState as Record<string, unknown>,
  });

  await batch.commit();
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
  lga_id?: string;
  state_id?: string;
  ward_id?: string;
  polling_unit_id?: string;
  submitted_by?: string;
  reviewed_by?: string;
}

/*
 * Every present field becomes one equality filter, so the query
 * never returns a document the read rule cannot prove. (The old
 * branchy version silently DROPPED a polling-unit filter whenever
 * a contest filter was also present — a member with a
 * polling-unit assignment then queried the whole contest and the
 * rules rejected the listener.)
 *
 * No orderBy: ordering a multi-equality query would demand a
 * composite index for no gain — the subscribers sort client-side.
 */
function buildQuery(collectionName: string, constraint?: object): Query {
  const clauses = [];

  for (const [field, value] of Object.entries(constraint ?? {})) {
    if (typeof value === "string" && value) {
      clauses.push(where(field, "==", value));
    }
  }

  return query(collection(db, collectionName), ...clauses);
}

/*
 * Generic multi-constraint merge: one listener per provable query,
 * snapshots merged by document id, "initial load" reported once
 * every listener has answered. A deleted document must leave the
 * merge, so each listener keeps its own id set.
 */
function subscribeMerged<T extends { id: string }>(
  collectionName: string,
  constraints: object[],
  onData: (docs: T[], isInitialLoad: boolean) => void,
  onError: ((err: Error) => void) | undefined,
  errorLabel: string,
): Unsubscribe {
  const merged = new Map<string, T>();
  const loaded = new Array<boolean>(constraints.length).fill(false);
  const ownedIds: Set<string>[] = constraints.map(() => new Set());
  let deliveredInitialLoad = false;

  const emit = () => {
    const allLoaded = loaded.every(Boolean);
    const isInitialLoad = !deliveredInitialLoad && allLoaded;
    if (isInitialLoad) deliveredInitialLoad = true;
    onData(Array.from(merged.values()), isInitialLoad);
  };

  const unsubscribes = constraints.map((constraint, index) =>
    onSnapshot(
      buildQuery(collectionName, constraint),
      (snapshot) => {
        const owned = ownedIds[index];

        for (const id of owned) {
          merged.delete(id);
        }
        owned.clear();

        for (const d of snapshot.docs) {
          owned.add(d.id);
          merged.set(d.id, { id: d.id, ...d.data() } as T);
        }

        loaded[index] = true;
        emit();
      },
      (err) => {
        console.error(`Error in ${errorLabel} listener:`, err);
        if (onError) onError(err);
      },
    ),
  );

  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
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
   * No constraint at all keeps the original one-listener behaviour:
   * the whole collection (admin / officer reads).
   */
  const effective = constraints.length > 0 ? constraints : [{}];

  return subscribeMerged<ElectionResultDoc>(
    "election_results",
    effective,
    onData,
    onError,
    "election results",
  );
}

/**
 * One-off read of a contest's results, filtered by level after the
 * query. Legacy rows (no `result_level`) count as polling-unit results.
 *
 * The dashboard deliberately keeps ONE real-time listener and
 * partitions in memory; this helper is for callers that need a
 * point-in-time read.
 */
export async function getResultsByLevel(
  contestId: string,
  level: ElectionResultLevel,
): Promise<ElectionResultDoc[]> {
  const snap = await getDocs(
    query(
      collection(db, "election_results"),
      where("contest_id", "==", contestId),
    ),
  );

  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }) as ElectionResultDoc)
    .filter((result) => getResultLevel(result) === level);
}

/*
 * ============================================================
 * POLLING UNIT REPORTS SERVICE
 * ============================================================
 */

/*
 * Resolve the active contest for any operations submission (result,
 * PU report, incident) — or abort when none is set. This is the
 * round-4 gate that keeps every submission inside the active
 * contest's footprint, regardless of who is submitting.
 */
async function requireActiveContest(): Promise<ElectionContest> {
  const activeContestId = await getStrictActiveContestId();
  if (!activeContestId) {
    throw new Error(NO_ACTIVE_CONTEST_MESSAGE);
  }

  const contest = await getContest(activeContestId);
  if (!contest) {
    throw new Error(NO_ACTIVE_CONTEST_MESSAGE);
  }
  return contest;
}

/*
 * Guard every non-result submission against the active contest's
 * geographic scope. The ward's LGA is derived from the seeded
 * electoral hierarchy — never trusted from the caller.
 */
async function assertWardWithinContestScope(
  contest: ElectionContest,
  wardId: string,
): Promise<string | null> {
  const { getAllEnuguLGAs } = await import("./electoral");
  const allLgas = await getAllEnuguLGAs();

  const lgaId = deriveLgaIdFromWard(allLgas, wardId);
  if (!lgaId || !contestCoversWard(contest, lgaId, wardId, allLgas)) {
    throw new Error(
      "The selected ward is not within the scope of the active contest.",
    );
  }

  return lgaId;
}

/*
 * Round-5 submission ownership — the same principle as results:
 *
 *   members (everyone except admins and election officers) may
 *   only report from the ward and polling unit their own profile
 *   is registered at; admins and officers may report from
 *   anywhere within the active contest (checked above).
 *
 * Registered location is read from `users/{submitted_by}` — never
 * trusted from the payload. A ward-level incident (no polling unit)
 * still requires the reporter to be registered in that ward.
 */
async function assertSubmitterRegisteredLocation(
  submittedBy: string,
  wardId: string,
  pollingUnitId: string | null | undefined,
): Promise<void> {
  const profileSnap = await getDoc(doc(db, "users", submittedBy));
  if (!profileSnap.exists()) {
    throw new Error(
      "Your account profile could not be verified. Please sign in and try again.",
    );
  }

  const profile = profileSnap.data() as {
    access_role?: string;
    ward_id?: string;
    polling_unit_id?: string;
  };

  if (
    profile.access_role === "admin" ||
    profile.access_role === "election_officer"
  ) {
    return;
  }

  if ((profile.ward_id ?? "").trim() !== wardId.trim()) {
    throw new Error(
      "You can only report within your registered ward.",
    );
  }

  const requestedPu = (pollingUnitId ?? "").trim();
  if (
    requestedPu &&
    (profile.polling_unit_id ?? "").trim() !== requestedPu
  ) {
    throw new Error(
      "You can only report from your registered polling unit.",
    );
  }
}

export async function createPUReport(data: {
  ward_id: string;
  polling_unit_id: string;
  /** The selected LGA — persisted so rules can scope-check creates. */
  lga_id: string;
  submitted_by: string;
  report_type: PUReportDoc["report_type"];
  title: string;
  content: string;
  cloudinary_url?: string | null;
}) {
  const contest = await requireActiveContest();
  const resolvedLgaId = await assertWardWithinContestScope(
    contest,
    data.ward_id,
  );

  if (
    data.lga_id &&
    resolvedLgaId &&
    data.lga_id.toLowerCase() !== resolvedLgaId.toLowerCase()
  ) {
    throw new Error(
      "The selected ward does not belong to the selected LGA.",
    );
  }

  /*
   * Round-5: a member submits only from their registered polling
   * unit; admins and officers from anywhere within the contest.
   */
  await assertSubmitterRegisteredLocation(
    data.submitted_by,
    data.ward_id,
    data.polling_unit_id,
  );

  const ref = await addDoc(collection(db, "pu_reports"), {...data,
    status: "submitted",
    created_at: serverTimestamp(),
  });
  return ref.id;
}

/*
 * Scope constraint for PU report reads. Mirrors the `pu_reports`
 * read rule: own submissions (submitted_by), or ward / polling-unit
 * scoped reads backed by a `user_access` projection. Admins and
 * election officers pass nothing and read the whole collection.
 */
export interface PUReportScopeConstraint {
  ward_id?: string;
  polling_unit_id?: string;
  submitted_by?: string;
}

export function subscribeToPUReports(
  onData: (reports: PUReportDoc[]) => void,
  onError?: (err: Error) => void,
  scopeConstraint?: PUReportScopeConstraint,
  additionalConstraints?: PUReportScopeConstraint[],
): Unsubscribe {
  const constraints = [
    scopeConstraint,
    ...(additionalConstraints ?? []),
  ].filter(Boolean) as PUReportScopeConstraint[];

  const effective = constraints.length > 0 ? constraints : [{}];

  return subscribeMerged<PUReportDoc>(
    "pu_reports",
    effective,
    (docs, _isInitialLoad) => {
      onData(
        [...docs].sort(
          (first, second) =>
            getTimestampMillis(second.created_at) -
            getTimestampMillis(first.created_at),
        ),
      );
    },
    onError,
    "PU reports",
  );
}

/*
 * ============================================================
 * ELECTION INCIDENTS SERVICE
 * ============================================================
 */export async function createElectionIncident(data: {
  ward_id: string;
  polling_unit_id?: string | null;
  /** The selected LGA — persisted so rules can scope-check creates. */
  lga_id: string;
  incident_type: ElectionIncidentDoc["incident_type"];
  severity: ElectionIncidentDoc["severity"];
  description: string;
  reported_by: string;
  cloudinary_url?: string | null;
}) {
  const contest = await requireActiveContest();
  const resolvedLgaId = await assertWardWithinContestScope(
    contest,
    data.ward_id,
  );

  if (
    data.lga_id &&
    resolvedLgaId &&
    data.lga_id.toLowerCase() !== resolvedLgaId.toLowerCase()
  ) {
    throw new Error(
      "The selected ward does not belong to the selected LGA.",
    );
  }

  /*
   * Round-5: a member reports only from their registered ward —
   * and, when a polling unit is attached, only from their own PU.
   * Admins and officers report anywhere within the contest.
   */
  await assertSubmitterRegisteredLocation(
    data.reported_by,
    data.ward_id,
    data.polling_unit_id,
  );

  const ref = await addDoc(collection(db, "election_incidents"), {...data,
    status: "reported",
    created_at: serverTimestamp(),
  });
  return ref.id;
}

/*
 * Scope constraint for incident reads. Mirrors the
 * `election_incidents` read rule: own reports (reported_by), or
 * ward / polling-unit scoped reads backed by a `user_access`
 * projection. Admins and election officers pass nothing.
 */
export interface ElectionIncidentScopeConstraint {
  ward_id?: string;
  polling_unit_id?: string;
  reported_by?: string;
}

export function subscribeToElectionIncidents(
  onData: (incidents: ElectionIncidentDoc[]) => void,
  onError?: (err: Error) => void,
  scopeConstraint?: ElectionIncidentScopeConstraint,
  additionalConstraints?: ElectionIncidentScopeConstraint[],
): Unsubscribe {
  const constraints = [
    scopeConstraint,
    ...(additionalConstraints ?? []),
  ].filter(Boolean) as ElectionIncidentScopeConstraint[];

  const effective = constraints.length > 0 ? constraints : [{}];

  return subscribeMerged<ElectionIncidentDoc>(
    "election_incidents",
    effective,
    (docs, _isInitialLoad) => {
      onData(
        [...docs].sort(
          (first, second) =>
            getTimestampMillis(second.created_at) -
            getTimestampMillis(first.created_at),
        ),
      );
    },
    onError,
    "election incidents",
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
