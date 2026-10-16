/*
 * ============================================================
 * USER NAME RESOLUTION — LIVE, BATCHED, NEVER RAW DOC IDS
 * ============================================================
 *
 * Result / PU-report / incident documents store only the uid of
 * the person who acted (`submitted_by`, `reviewed_by`,
 * `reported_by`, `actor_id`, ...). Names are NEVER denormalised
 * onto those documents: they are resolved live from the `users`
 * collection so a member renaming themselves is reflected
 * everywhere on the next load.
 *
 * Pages hold many records at once, so names are resolved in
 * batches — one `in` query per 30 uids (the Firestore `in`
 * limit) — and the resulting map is kept for the lifetime of the
 * page render instead of being refetched per row.
 */

import { collection, getDocs, query, where, documentId } from "firebase/firestore";

import { db } from "@/lib/firebase/config";

/** Shown whenever a profile is missing or carries no usable name. */
export const UNKNOWN_MEMBER_NAME = "Unknown member";

/** Firestore `in` queries accept at most 30 values per call. */
const IN_QUERY_CHUNK_SIZE = 30;

interface UserLike {
  full_name?: string | null;
  name?: string | null;
}

/**
 * Best display name for a user document. Falls back to
 * "Unknown member" — never an empty string and never a doc id.
 */
export function userDisplayName(profile: UserLike | null | undefined): string {
  const full = typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
  if (full) return full;

  const alt = typeof profile?.name === "string" ? profile.name.trim() : "";
  return alt || UNKNOWN_MEMBER_NAME;
}

/**
 * Resolve display names for a set of uids in as few queries as
 * possible. Every requested uid is present in the returned map:
 * uids without a usable profile map to "Unknown member", so
 * callers can render `names.get(uid)` directly and can never end
 * up showing a raw Firestore doc id.
 */
export async function resolveUserNames(
  uids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();

  const unique = Array.from(
    new Set(
      uids.filter((uid): uid is string => typeof uid === "string" && uid.trim() !== ""),
    ),
  );

  for (let i = 0; i < unique.length; i += IN_QUERY_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + IN_QUERY_CHUNK_SIZE);

    try {
      const snap = await getDocs(
        query(collection(db, "users"), where(documentId(), "in", chunk)),
      );

      for (const userDoc of snap.docs) {
        names.set(userDoc.id, userDisplayName(userDoc.data() as UserLike));
      }
    } catch (err) {
      // A failed batch must not leak raw uids into the UI — the
      // fallback below covers every uid in the chunk.
      console.error("Failed to resolve user names:", err);
    }
  }

  for (const uid of unique) {
    if (!names.has(uid)) names.set(uid, UNKNOWN_MEMBER_NAME);
  }

  return names;
}
