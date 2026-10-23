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
