/*
 * ============================================================
 * ELECTION AUDIT TRAIL — IMMUTABLE
 * ============================================================
 *
 * Every sensitive election action on election_results is recorded
 * in the `election_audit` collection as an append-only entry.
 * Firestore rules allow create for election officers / admins and
 * forbid update + delete, so once written an entry can never be
 * revised or removed from the client.
 *
 * A deletion is a two-step operation inside ONE Firestore batch:
 *
 *   1. write the audit entry (with the full snapshot of the doc)
 *   2. delete the election_results doc
 *
 * Batches commit atomically, so both succeed or both fail.
 *
 * The old per-document `history` array stays untouched — it is
 * page-level provenance that travels with the result itself. The
 * audit trail is the immutable collection that survives even the
 * document being deleted.
 */

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "./config";
import type {
  ElectionAuditAction,
  ElectionAuditEntry,
} from "@/types";

/** Mirror of the actions named in docs/election-audit.md. */
export const ELECTION_AUDIT_ACTIONS: readonly ElectionAuditAction[] = [
  "result_submitted",
  "result_approved",
  "result_rejected",
  "result_clarification_required",
  "result_reopened",
  "result_deleted",
];

/** Collections an audit entry may point at. */
export const ELECTION_AUDIT_TARGET_COLLECTIONS = [
  "election_results",
  "pu_reports",
  "election_incidents",
] as const;

export type ElectionAuditTargetCollection =
  (typeof ELECTION_AUDIT_TARGET_COLLECTIONS)[number];

export interface ElectionAuditActor {
  id: string;
  /** Display-name snapshot of the actor at action time. */
  name: string;
  /** Role snapshot ("admin" / "election_officer" / "member"). */
  role: string;
}

interface BuildAuditEntryInput {
  action: ElectionAuditAction;
  target_collection: ElectionAuditTargetCollection;
  target_doc_id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  /** Required for result_deleted; optional otherwise. */
  reason?: string | null;
  /** FULL contents of the target document — delete entries only. */
  snapshot?: Record<string, unknown> | null;
  /** Extra context, e.g. the previous status. */
  metadata?: Record<string, unknown> | null;
}

type UnknownRecord = Record<string, unknown>;

/** Firestore rejects `undefined` values — shallow-clear them. */
function ensureNoUndefined(record: UnknownRecord): UnknownRecord {
  const clean: UnknownRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}

/**
 * Server-side ("rules") shape of an election_audit document, kept in
 * one place so the client writer and any test agree. Throws with a
 * plain-language message when the input would be rejected by rules.
 */
export function buildElectionAuditEntry(
  input: BuildAuditEntryInput,
): UnknownRecord {
  const entry: UnknownRecord = ensureNoUndefined({
    action: input.action,
    target_collection: input.target_collection,
    target_doc_id: input.target_doc_id,
    actor_id: input.actor_id,
    actor_name: input.actor_name,
    actor_role: input.actor_role,
    at: serverTimestamp(),
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
  });

  if (input.action === "result_deleted") {
    if (!input.reason || !input.reason.trim()) {
      throw new Error(
        "A reason is required when deleting an election result.",
      );
    }
    if (!input.snapshot || typeof input.snapshot !== "object") {
      throw new Error(
        "The audit entry for a deletion must carry the full snapshot of the deleted result.",
      );
    }
    entry.snapshot = ensureNoUndefined(input.snapshot);
  }

  return entry;
}

/*
 * ============================================================
 * WRITE PATH
 * ============================================================
 */

/**
 * Append one audit entry on its own. Used when the audited write
 * already committed under another function.
 */
export async function appendElectionAuditEntry(
  input: BuildAuditEntryInput,
): Promise<string> {
  // Local import avoids a dependency cycle between the audit
  // module and the main election module (which reviews results).
  const { addDoc, collection } = await import("firebase/firestore");
  const ref = await addDoc(
    collection(db, "election_audit"),
    buildElectionAuditEntry(input),
  );
  return ref.id;
}

/**
 * Delete a submitted election result, writing the immutable audit
 * entry — with the FULL snapshot of the doc being deleted — in the
 * same Firestore batch. Officers and admins only (rules enforce).
 */
export async function deleteElectionResultWithAudit(data: {
  resultDocId: string;
  /** The FULL result document about to be deleted. */
  existingDoc: object;
  actor: ElectionAuditActor;
  reason: string;
}): Promise<void> {
  const existingDoc = data.existingDoc as { status?: unknown } | null;

  if (!data.resultDocId || !data.existingDoc) {
    throw new Error("The result to delete could not be resolved.");
  }

  if (!data.reason || !data.reason.trim()) {
    throw new Error("A reason is required when deleting an election result.");
  }

  const batch = writeBatch(db);

  /*
   * Deterministic id — the Firestore rules verify via getAfter() that
   * THIS exact document exists, carries action "result_deleted", a
   * non-empty reason and the full snapshot, before the paired delete
   * of the result is allowed to commit.
   */
  const auditRef = doc(
    db,
    "election_audit",
    `${data.resultDocId}__deleted__${data.actor.id}`,
  );
  batch.set(
    auditRef,
    buildElectionAuditEntry({
      action: "result_deleted",
      target_collection: "election_results",
      target_doc_id: data.resultDocId,
      actor_id: data.actor.id,
      actor_name: data.actor.name,
      actor_role: data.actor.role,
      reason: data.reason.trim(),
      snapshot: data.existingDoc as UnknownRecord,
      metadata: {
        previous_status: existingDoc?.status ?? null,
      },
    }),
  );

  batch.delete(doc(db, "election_results", data.resultDocId));

  await batch.commit();
}

/*
 * ============================================================
 * READ PATH
 * ============================================================
 */

/**
 * Live listener over the newest audit entries. No composite index is
 * needed: created_at desc on a single field is auto-indexed.
 */
export function subscribeToElectionAudit(
  onData: (entries: ElectionAuditEntry[]) => void,
  onError?: (error: Error) => void,
  maxEntries = 300,
): () => void {
  const auditQuery = query(
    collection(db, "election_audit"),
    orderBy("at", "desc"),
    limit(maxEntries),
  );

  return onSnapshot(
    auditQuery,
    (snapshot) => {
      onData(
        snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as ElectionAuditEntry,
        ),
      );
    },
    (error) => {
      console.error("election_audit listener error:", error);
      if (onError) {
        onError(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );
}
