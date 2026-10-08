/**
 * Date and deadline helpers for PolitiCore tasks and operations.
 *
 * All deadline calculations are based on Africa/Lagos (WAT, UTC+1).
 */

/**
 * Returns a Date object representing 23:59:59.999 Africa/Lagos (WAT, UTC+1) on the specified deadline date string.
 * Supports "DD-MM-YYYY" and "YYYY-MM-DD" string formats.
 */
export function deadlineEndOfDay(deadline: string): Date {
  if (!deadline || typeof deadline !== "string") {
    return new Date(NaN);
  }

  const cleanDate = deadline.trim();
  let year: number;
  let month: number; // 0-indexed for JS Date
  let day: number;

  if (cleanDate.includes("-")) {
    const parts = cleanDate.split("-").map((p) => parseInt(p, 10));

    if (parts.length === 3) {
      if (parts[0] > 1000) {
        // YYYY-MM-DD format
        [year, month, day] = [parts[0], parts[1] - 1, parts[2]];
      } else {
        // DD-MM-YYYY format
        [day, month, year] = [parts[0], parts[1] - 1, parts[2]];
      }
    } else {
      return new Date(NaN);
    }
  } else {
    return new Date(NaN);
  }

  // Create Date in UTC first, adjusting for WAT (UTC+1 offset = -60 mins relative to UTC)
  // End of day 23:59:59.999 WAT is 22:59:59.999 UTC
  const endOfDayUtc = Date.UTC(year, month, day, 22, 59, 59, 999);
  return new Date(endOfDayUtc);
}

/**
 * Checks if a task deadline has passed.
 * - Tasks with deadline null, undefined, or empty string NEVER expire.
 * - Expiry occurs at 23:59:59.999 Africa/Lagos (WAT, UTC+1) on the deadline date.
 */
export function isTaskExpired(
  deadline?: string | null,
  now = new Date(),
): boolean {
  if (!deadline || !deadline.trim()) {
    return false;
  }

  const endOfDay = deadlineEndOfDay(deadline);
  if (isNaN(endOfDay.getTime())) {
    return false;
  }

  return now.getTime() > endOfDay.getTime();
}

/**
 * Normalizes deadline input into standard "DD-MM-YYYY" format for storage.
 */
export function normalizeDeadline(deadline?: string | null): string | null {
  if (!deadline || !deadline.trim()) return null;

  const cleanDate = deadline.trim();
  if (cleanDate.includes("-")) {
    const parts = cleanDate.split("-").map((p) => parseInt(p, 10));
    if (parts.length === 3) {
      if (parts[0] > 1000) {
        // YYYY-MM-DD to DD-MM-YYYY
        const y = parts[0];
        const m = String(parts[1]).padStart(2, "0");
        const d = String(parts[2]).padStart(2, "0");
        return `${d}-${m}-${y}`;
      } else {
        // Already DD-MM-YYYY
        const d = String(parts[0]).padStart(2, "0");
        const m = String(parts[1]).padStart(2, "0");
        const y = parts[2];
        return `${d}-${m}-${y}`;
      }
    }
  }

  return cleanDate;
}
