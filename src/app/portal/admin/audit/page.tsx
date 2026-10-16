"use client";

/*
 * ============================================================
 * ELECTION AUDIT LOG — /portal/admin/audit
 * ============================================================
 *
 * Append-only trail for election result actions, written by the
 * client into `election_audit` (see
 * src/lib/firebase/election-audit.ts). Admins and election
 * officers may read; nobody — not even admins — may update or
 * delete an entry (firestore.rules).
 *
 * Actor names come primarily from the point-in-time
 * `actor_name` snapshot captured when the entry was written; a
 * missing snapshot falls back to a live batch lookup so a row
 * never renders a raw doc id.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Loader2,
  ShieldAlert,
  Trash2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import {
  subscribeToElectionAudit,
} from "@/lib/firebase/election-audit";
import type { ElectionAuditEntry } from "@/types";
import { resolveUserNames } from "@/lib/userNames";

const ACTION_LABELS: Record<string, string> = {
  result_submitted: "Result submitted",
  result_approved: "Result approved",
  result_rejected: "Result rejected",
  result_clarification_required: "Result — clarification required",
  result_reopened: "Result reopened",
  result_corrected: "Result corrected",
  result_deleted: "Result DELETED",
};

const ACTION_BADGE_STYLES: Record<string, string> = {
  result_submitted: "bg-blue-100 text-blue-800 border-blue-200",
  result_approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  result_rejected: "bg-red-100 text-red-800 border-red-200",
  result_clarification_required: "bg-amber-100 text-amber-800 border-amber-200",
  result_reopened: "bg-purple-100 text-purple-800 border-purple-200",
  result_corrected: "bg-slate-100 text-slate-800 border-slate-200",
  result_deleted: "bg-red-600 text-white border-red-700",
};

function formatTimestamp(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in (value as Record<string, unknown>) &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate().toLocaleString();
    } catch {
      /* fall through */
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  return "—";
}

export default function ElectionAuditPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const isElectionOfficer = profile?.access_role === "election_officer";
  const isAdmin = profile?.access_role === "admin";

  const [entries, setEntries] = useState<ElectionAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /*
   * Fallback live names for rows whose actor_name snapshot is
   * missing — batched, never one fetch per row.
   */
  const [fallbackNames, setFallbackNames] = useState<Map<string, string>>(
    () => new Map(),
  );

  useEffect(() => {
    if (authLoading) return;

    if (!profile) {
      router.replace("/portal/auth/login");
      return;
    }

    if (!isAdmin && !isElectionOfficer) {
      router.replace("/portal/dashboard");
    }
  }, [profile, authLoading, router, isAdmin, isElectionOfficer]);

  useEffect(() => {
    if (!profile) return;
    if (!isAdmin && !isElectionOfficer) return;

    const unsubscribe = subscribeToElectionAudit(
      (data) => {
        setEntries(data);
        setLoading(false);
      },
      () => {
        setLoadError(
          "The audit trail could not be loaded. Please try again.",
        );
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [profile, isAdmin, isElectionOfficer]);

  useEffect(() => {
    const uids = entries
      .filter((e) => !e.actor_name)
      .map((e) => e.actor_id)
      .filter((uid): uid is string => typeof uid === "string" && uid !== "");

    if (uids.length === 0) return;

    let cancelled = false;
    resolveUserNames(uids).then((resolved) => {
      if (cancelled) return;
      setFallbackNames((prev) => new Map([...prev, ...resolved]));
    });

    return () => {
      cancelled = true;
    };
  }, [entries]);

  const actorLabel = (entry: ElectionAuditEntry) =>
    entry.actor_name?.trim() ||
    fallbackNames.get(entry.actor_id) ||
    "Unknown member";

  if (authLoading || (!isAdmin && !isElectionOfficer && !loading)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <span className="ml-3 text-gray-500">Loading audit log...</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <span className="ml-3 text-gray-500">Loading audit log...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div>
        <Link
          href="/portal/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <div className="flex items-center gap-2 text-emerald-700 font-semibold text-xs tracking-wide uppercase mt-2 mb-1">
          <FileText className="w-4 h-4" />
          <span>ELECTION AUDIT TRAIL</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          Election Audit Log
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Immutable, append-only record of every state change to election
          results. Entries cannot be modified or deleted.
        </p>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">
            No audit entries recorded yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const isDelete = entry.action === "result_deleted";
            const isOpen = expandedId === entry.id;

            return (
              <div
                key={entry.id}
                className={`bg-white rounded-xl border p-4 space-y-2 ${
                  isDelete ? "border-red-300" : "border-gray-200"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        ACTION_BADGE_STYLES[entry.action] ??
                        "bg-gray-100 text-gray-700 border-gray-200"
                      }`}
                    >
                      {isDelete ? (
                        <Trash2 className="inline w-3 h-3 mr-1" />
                      ) : null}
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                    <span className="text-xs text-gray-500 font-mono truncate max-w-[16rem]">
                      {entry.target_collection}/{entry.target_doc_id}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatTimestamp(entry.at)}
                  </span>
                </div>

                <div className="text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Actor: <span className="font-semibold text-gray-800">{actorLabel(entry)}</span>
                    {entry.actor_role ? (
                      <span className="text-gray-400"> · {entry.actor_role}</span>
                    ) : null}
                  </span>
                  {entry.reason ? (
                    <span className="w-full sm:w-auto">
                      Reason:{" "}
                      <span className="font-medium text-gray-800">
                        {entry.reason}
                      </span>
                    </span>
                  ) : null}
                  {entry.metadata?.previous_status ? (
                    <span className="text-gray-400">
                      Previous status: {String(entry.metadata.previous_status)}
                    </span>
                  ) : null}
                </div>

                {(isDelete || entry.snapshot) && (
                  <button
                    onClick={() => setExpandedId(isOpen ? null : entry.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    {isOpen ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                    {isDelete
                      ? "View deleted result snapshot"
                      : "View entry snapshot"}
                  </button>
                )}

                {isOpen && entry.snapshot && (
                  <pre className="text-[11px] bg-slate-900 text-emerald-300 rounded-lg p-3 overflow-x-auto max-h-72">
                    {JSON.stringify(entry.snapshot, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
