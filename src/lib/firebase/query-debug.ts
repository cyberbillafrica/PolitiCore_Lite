"use client";

/*
 * ============================================================
 * CAMPAIGN READ DIAGNOSTICS
 * ============================================================
 *
 * A Firestore list read fails as a WHOLE when the rules cannot prove
 * every document the query could return. The client only ever saw
 * "Missing or insufficient permissions", which says nothing about
 * WHICH query asked for too much — the reason this bug survived a
 * round of debugging.
 *
 * Every campaign read runs through `campaignRead()` so the failing
 * collection and its exact filter land in the console before the page
 * falls through to its friendly message.
 */

export interface CampaignReadLabel {
  /** Firestore collection being read. */
  collection: string;
  /** The where() clauses, in readable form. */
  filter: Record<string, unknown>;
}

export async function campaignRead<T>(
  label: CampaignReadLabel,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(
      `[campaign-read] ${label.collection} ${JSON.stringify(label.filter)} failed:`,
      error,
    );

    throw error;
  }
}

/**
 * Election-surface sibling of `campaignRead()`.
 *
 * The election result / PU-report / incident getters produce the same
 * opaque "Missing or insufficient permissions" on a rules rejection,
 * and a `failed-precondition` on a missing composite index — which the
 * UI renders as "This action can't be completed right now". Neither
 * names the query. Every election read below therefore logs its
 * collection and exact filter before the page shows its friendly
 * message.
 */
export async function electionRead<T>(
  label: CampaignReadLabel,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "unknown";

    console.error(
      `[election-read] ${label.collection} ${JSON.stringify(label.filter)} failed (code: ${code}):`,
      error,
    );

    throw error;
  }
}

/** Same idea for a write, so a denied create names its payload shape. */
export async function campaignWrite<T>(
  label: { collection: string; operation: string; id?: string },
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(
      `[campaign-write] ${label.operation} ${label.collection}` +
        `${label.id ? `/${label.id}` : ""} failed:`,
      error,
    );

    throw error;
  }
}
