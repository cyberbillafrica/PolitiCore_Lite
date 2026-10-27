/*
 * ============================================================
 * SITE SETTINGS CACHE (localStorage)
 * ============================================================
 *
 * `getSiteSettings()` reads Firestore first; this cached copy is only
 * consulted when that read fails or times out. The parser lives in
 * its own module so the fallback behaviour is unit-testable without
 * Firebase.
 */

/** Parse a cached settings payload; returns null for anything unusable. */
export function parseCachedSettings(
  raw: string | null | undefined,
): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
