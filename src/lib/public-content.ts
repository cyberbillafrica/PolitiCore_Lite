import type { ManifestoSection } from "@/types";

/*
 * ============================================================
 * PUBLIC CONTENT HELPERS
 * ============================================================
 *
 * Pure functions shared by the public pages (biography, manifesto,
 * events) and their tests.
 *
 * They hold the "render or skip" decisions so a page never prints
 * `undefined` or an empty element: a Firestore document written
 * before a field existed fails the check and the element is skipped.
 */

/**
 * True when a content document may render on the public site.
 *
 * A type guard so a page can gate on it and then read the document's
 * fields without a non-null assertion.
 */
export function isPublished<T extends { status?: string }>(
  doc?: T | null,
): doc is NonNullable<T> {
  return doc?.status === "published";
}

/** True when a string has visible content. */
export function hasText(value?: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** True when the value is an absolute http(s) URL. */
export function isValidHttpUrl(value?: string | null): boolean {
  if (!hasText(value)) return false;

  try {
    const url = new URL(value as string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Force a real download for a Cloudinary-hosted file.
 *
 * The HTML `download` attribute is ignored for cross-origin URLs, and a
 * Cloudinary raw delivery is served inline (`Content-Type: application/pdf`,
 * no `Content-Disposition`) so the in-page iframe can render it. Adding the
 * `fl_attachment` delivery flag makes Cloudinary answer with
 * `Content-Disposition: attachment`, so the download button saves the file
 * instead of opening it. Any other URL is returned unchanged.
 */
export function cloudinaryDownloadUrl(value?: string | null): string {
  if (!isValidHttpUrl(value)) return "";

  const url = value as string;

  try {
    const parsed = new URL(url);

    if (
      parsed.hostname !== "res.cloudinary.com" ||
      !/\/(image|raw|video)\/upload\//.test(parsed.pathname) ||
      /\/fl_attachment[/,]/.test(parsed.pathname)
    ) {
      return url;
    }

    parsed.pathname = parsed.pathname.replace(
      /\/(image|raw|video)\/upload\//,
      "/$1/upload/fl_attachment/",
    );

    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * One homepage section toggle. A section is hidden only when its
 * config explicitly says `show: false`, so a settings document that
 * predates a section still renders it.
 */
export function sectionVisible(config?: { show?: boolean } | null): boolean {
  return config?.show !== false;
}

/** Split body text into paragraphs (blank line or single newline). */
export function splitParagraphs(text?: string | null): string[] {
  if (!hasText(text)) return [];

  return (text as string)
    .split(/\n\s*\n|\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/**
 * The first `max` paragraphs of a body — the homepage teaser preview.
 * The dedicated page renders the full body from the same document.
 */
export function previewParagraphs(text?: string | null, max = 3): string[] {
  return splitParagraphs(text).slice(0, max);
}

/**
 * The manifesto sections as they can safely be rendered: sections
 * without a title are dropped, `points` is always an array, and blank
 * points are removed. Empty descriptions are left as "" and skipped at
 * render time.
 */
export function normalizeManifestoSections(
  sections?: ManifestoSection[] | null,
): ManifestoSection[] {
  if (!Array.isArray(sections)) return [];

  return sections
    .filter((section) => section && hasText(section.title))
    .map((section) => ({
      ...section,
      description: hasText(section.description) ? section.description : "",
      points: Array.isArray(section.points)
        ? section.points.filter((point) => hasText(point))
        : [],
    }));
}
