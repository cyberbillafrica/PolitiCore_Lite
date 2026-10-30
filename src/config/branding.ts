/*
 * ============================================================
 * PER-CLIENT BRANDING — ONE FILE, ENV OVERRIDES
 * ============================================================
 *
 * Every string that ties this deployment to "Ifeanyi 2027" is
 * declared here. A clone changes .env.local (or the hosting
 * provider's env vars) and nothing else in src/ for branding.
 *
 * Defaults are EXACTLY the values that shipped before this file
 * existed, so a clone that sets no branding env vars renders
 * byte-identically to the source deployment.
 *
 * Runtime overrides still exist where they always did:
 * `site_settings/general` in Firestore (Admin -> Settings) is
 * merged over DEFAULT_SITE_SETTINGS, so a client can change
 * display copy after deployment without a redeploy. These values
 * are the seed/fallback used before that document exists.
 *
 * IMPORTANT: each value below reads a static
 * `process.env.NEXT_PUBLIC_*` member expression. Next.js only
 * inlines those into the browser bundle when written literally —
 * a dynamic lookup (`process.env[key]`) would be undefined in
 * client components.
 */

/** Trimmed env value, or the fallback when unset/blank. */
function read(value: string | undefined, fallback: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
}

/** `https://example.com///` -> `https://example.com` */
function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/*
 * Read once, before BRANDING exists: `appName` falls back to the
 * product name, and inside the object literal it cannot reference
 * `BRANDING.shortName` (temporal dead zone).
 */
const DEFAULT_SHORT_NAME = read(
  process.env.NEXT_PUBLIC_BRAND_SHORT_NAME,
  "PolitiCore",
);

export const BRANDING = {
  /**
   * Campaign identity, e.g. the browser title suffix and share copy.
   * A deployment that sets no env var is the PolitiCore product, not a
   * candidate, so the fallback is the product name.
   */
  appName: read(process.env.NEXT_PUBLIC_BRAND_APP_NAME, DEFAULT_SHORT_NAME),

  /** Platform/product name in normal case: "PolitiCore". */
  shortName: DEFAULT_SHORT_NAME,

  /** Platform wordmark as displayed: "POLITICORE". */
  brandName: read(process.env.NEXT_PUBLIC_BRAND_NAME, "POLITICORE"),

  /** Square logo fallback when no logo image is uploaded. */
  monogram: read(process.env.NEXT_PUBLIC_BRAND_MONOGRAM, "PC"),

  /** Candidate's common name: "Ifeanyi". */
  candidateName: read(process.env.NEXT_PUBLIC_BRAND_CANDIDATE_NAME, "Ifeanyi"),

  /** Candidate's full display name. */
  candidateFullName: read(
    process.env.NEXT_PUBLIC_BRAND_CANDIDATE_FULL,
    "Ifeanyichukwu Barth",
  ),

  /** Single-name form used in the documentation title. */
  candidateLegalName: read(
    process.env.NEXT_PUBLIC_BRAND_CANDIDATE_LEGAL_NAME,
    "Ifeanyichukwu",
  ),

  /** Party acronym, also used by scripts/verify-clone.ts. */
  partyAcronym: read(process.env.NEXT_PUBLIC_BRAND_PARTY_ACRONYM, "APC"),

  /** Election year used in labels, cycle defaults and countdown copy. */
  electionYear: read(process.env.NEXT_PUBLIC_BRAND_YEAR, "2027"),

  /** Platform descriptor. */
  tagline: read(
    process.env.NEXT_PUBLIC_BRAND_TAGLINE,
    "Political Operations & Campaign Intelligence Platform",
  ),

  /** Short uppercase descriptor used under the wordmark. */
  brandTagline: read(
    process.env.NEXT_PUBLIC_BRAND_BRAND_TAGLINE,
    "POLITICAL OPERATIONS PLATFORM",
  ),

  /** Canonical origin, no trailing slash. */
  siteUrl: withoutTrailingSlash(
    read(process.env.NEXT_PUBLIC_SITE_URL, "https://politicore.org"),
  ),

  /** Public contact address shown on /contact and in the footer. */
  supportEmail: read(
    process.env.NEXT_PUBLIC_BRAND_SUPPORT_EMAIL,
    "contact@politicore.org",
  ),

  /** Operations center label. */
  officeName: read(
    process.env.NEXT_PUBLIC_BRAND_OFFICE_NAME,
    "PolitiCore Operations Center",
  ),

  /** Secretariat name used as the default "about" author. */
  secretariatName: read(
    process.env.NEXT_PUBLIC_BRAND_SECRETARIAT_NAME,
    "PolitiCore Operations Secretariat",
  ),

  footerAddress: read(
    process.env.NEXT_PUBLIC_BRAND_FOOTER_ADDRESS,
    "PolitiCore Operations Center, Headquarters",
  ),

  footerPhone: read(
    process.env.NEXT_PUBLIC_BRAND_FOOTER_PHONE,
    "+234 800 765 4842",
  ),

  /** Agency credit in the footer and default copyright line. */
  developerName: read(
    process.env.NEXT_PUBLIC_BRAND_DEVELOPER_NAME,
    "CyberBill Africa",
  ),

  developerUrl: read(
    process.env.NEXT_PUBLIC_BRAND_DEVELOPER_URL,
    "https://cyberbillafrica.com",
  ),

  /** Seed palette (Firestore site settings can override at runtime). */
  primaryColor: read(process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR, "#008751"),
  secondaryColor: read(
    process.env.NEXT_PUBLIC_BRAND_SECONDARY_COLOR,
    "#f59e0b",
  ),

  /** Countdown target and its human label. */
  electionDateISO: read(
    process.env.NEXT_PUBLIC_BRAND_ELECTION_DATE,
    "2027-02-05T23:00:00.000Z",
  ),
  electionDateLabel: read(
    process.env.NEXT_PUBLIC_BRAND_ELECTION_DATE_LABEL,
    "Saturday, 6 February 2027",
  ),

  /** Cloudinary folder root for every upload (never leading/trailing slash). */
  cloudinaryFolderPrefix: read(
    process.env.NEXT_PUBLIC_CLOUDINARY_FOLDER_PREFIX,
    "ifeanyi-2027",
  ),
} as const;

export type Branding = typeof BRANDING;
