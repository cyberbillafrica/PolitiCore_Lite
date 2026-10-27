import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import { BRANDING } from "@/config/branding";
import { parseCachedSettings } from "@/lib/settings-cache";

/* ============================================================
 * HOMEPAGE SECTION CONFIGURATION
 *
 * The public homepage renders a FIXED composition:
 *
 *   Hero -> CTAs -> Biography teaser -> Manifesto teaser -> News -> Events
 *
 * Every section carries a `show` toggle; a hidden section does not
 * render at all (no empty placeholders). Everything visible inside
 * the sections is driven by SiteSettings so a client can launch a
 * fresh deployment without touching code.
 * ============================================================ */

/** One campaign action button rendered in the homepage CTA band. */
export interface CampaignCta {
  /** Stable identity, e.g. "volunteer" | "donate" | "contact" | "share" | custom slug. */
  id: string;
  /** Button text. */
  label: string;
  /** Target route. For kind === "donate" this is ignored (opens the modal). */
  link: string;
  /**Behaviour: donate opens the bank-details modal; share copies the site URL. */
  kind: "volunteer" | "donate" | "contact" | "share" | "link";
  enabled: boolean;
}

export interface BiographyTeaserConfig {
  show: boolean;
  heading: string;
  /**
   * The teaser body is ALWAYS the published biography's `about`
   * (biographies/main) — the single source of truth — with the first
   * paragraphs shown on the homepage. There is deliberately no separate
   * teaser body field.
   */
  /** Portrait image URL. Empty = falls back to the biography document's `image_url`. */
  imageUrl: string;
  buttonLabel: string;
  buttonLink: string;
}

export interface ManifestoTeaserConfig {
  show: boolean;
  heading: string;
  /** Teaser body. Empty = falls back to the published manifesto's `introduction`. */
  body: string;
  buttonLabel: string;
  buttonLink: string;
}

export interface NewsSectionConfig {
  show: boolean;
  heading: string;
  /** How many published articles to render (default 3). */
  count: number;
  seeAllLabel: string;
  seeAllLink: string;
}

export interface EventsSectionConfig {
  show: boolean;
  heading: string;
  /** How many upcoming events to render (default 3). */
  count: number;
}

/* ============================================================
 * DONATION CONFIGURATION
 *
 * The campaign accepts donations by manual bank transfer only.
 * The Donate CTA shows this info in a modal; when `donateEnabled`
 * is false the CTA is hidden from the public site entirely.
 * ============================================================ */

export interface DonationSettings {
  donateEnabled: boolean;
  bankName: string;
  accountName: string;
  accountNumber: string;
  /** Optional enquiry line / reference format shown under the fields. */
  donationNote: string;
  updatedAt?: any;
}

export interface SiteSettings {
  // Organization Metadata
  organizationName: string;
  organizationShortName: string;
  organizationDescription: string;
  organizationType: string;
  country: string;
  stateRegion: string;

  // Hero Section
  heroShow?: boolean;
  heroTitle: string;
  heroTagline: string;
  heroDescription: string;
  heroCtaText: string;
  heroCtaLink: string;
  heroCta2Text?: string;
  heroCta2Link?: string;
  heroImageUrl: string;

  // Homepage section configuration (see HOMEPAGE SECTION CONFIGURATION above)
  bioTeaser?: BiographyTeaserConfig;
  manifestoTeaser?: ManifestoTeaserConfig;
  newsSection?: NewsSectionConfig;
  eventsSection?: EventsSectionConfig;

  // Campaign CTA buttons (homepage CTA band)
  campaignCtas?: CampaignCta[];

  // Donation bank-details configuration
  donation?: DonationSettings;

  // Branding & Colors
  brandName: string;
  brandTagline: string;
  logoUrl: string;
  primaryColor?: string;
  secondaryColor?: string;

  // Header & Navigation
  headerNotice?: string;

  // Footer & Contact Information
  footerAddress: string;
  footerPhone: string;
  footerEmail: string;
  copyrightText: string;

  // Geographic Structure Configuration
  senatorialZones?: string[];
  lgas?: string[];

  // Active Enabled Modules Toggles
  enabledModules: {
    socialTasks: boolean;
    leaderboard: boolean;
    campaignCouncil: boolean;
    electionOperations: boolean;
    news: boolean;
    gallery: boolean;
    structure: boolean;
    inecOfficers: boolean;
    announcements: boolean;
  };

  // Custom Terminology Labels
  terminology: {
    memberLabel: string;
    coordinatorLabel: string;
    lgaLabel: string;
    wardLabel: string;
    campaignLabel: string;
  };

  // Maintenance Mode Settings
  maintenanceMode: boolean;
  maintenanceScreen: "page" | "dark_blue";

  updatedAt?: any;
}

export const DEFAULT_BIO_TEASER: BiographyTeaserConfig = {
  show: true,
  heading: "The Candidate",
  imageUrl: "",
  buttonLabel: "Read Full Biography",
  buttonLink: "/biography",
};

export const DEFAULT_MANIFESTO_TEASER: ManifestoTeaserConfig = {
  show: true,
  heading: "The Manifesto",
  body: "",
  buttonLabel: "Read Full Manifesto",
  buttonLink: "/manifesto",
};

export const DEFAULT_NEWS_SECTION: NewsSectionConfig = {
  show: true,
  heading: "Latest News",
  count: 3,
  seeAllLabel: "View All →",
  seeAllLink: "/news",
};

export const DEFAULT_EVENTS_SECTION: EventsSectionConfig = {
  show: true,
  heading: "Upcoming Events",
  count: 3,
};

/*
 * Default CTA set: the campaign actions a public visitor can take.
 * Donate opens the bank-details modal and is shown only while
 * donation.donateEnabled is true (enforced at render time, because a
 * disabled donation setup must not simply grey out the button).
 */
export const DEFAULT_CAMPAIGN_CTAS: CampaignCta[] = [
  {
    id: "volunteer",
    label: "Volunteer for the Campaign",
    link: "/volunteer",
    kind: "volunteer",
    enabled: true,
  },
  {
    id: "donate",
    label: "Donate",
    link: "",
    kind: "donate",
    enabled: true,
  },
  {
    id: "contact",
    label: "Contact Operations Center",
    link: "/contact",
    kind: "contact",
    enabled: true,
  },
];

export const DEFAULT_DONATION_SETTINGS: DonationSettings = {
  donateEnabled: false,
  bankName: "",
  accountName: "",
  accountNumber: "",
  donationNote: "",
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  organizationName: `${BRANDING.shortName} Operations Platform`,
  organizationShortName: BRANDING.shortName,
  organizationDescription: "Centralizing political organization, stakeholders, grassroots outreach, field operations, communications, events, and operational reporting.",
  organizationType: "Political Campaign & Operations",
  country: "Nigeria",
  stateRegion: "Enugu State",

  heroShow: true,
  heroTitle: `${BRANDING.brandName} LITE`,
  heroTagline: BRANDING.tagline,
  heroDescription:
    "Bringing political organization, stakeholders, grassroots outreach, field operations, communications, events, reporting, and organizational coordination into one coherent system.",
  heroCtaText: "Explore Platform Features",
  heroCtaLink: "/about",
  heroCta2Text: "",
  heroCta2Link: "",
  heroImageUrl: "",

  bioTeaser: DEFAULT_BIO_TEASER,
  manifestoTeaser: DEFAULT_MANIFESTO_TEASER,
  newsSection: DEFAULT_NEWS_SECTION,
  eventsSection: DEFAULT_EVENTS_SECTION,
  campaignCtas: DEFAULT_CAMPAIGN_CTAS,
  donation: DEFAULT_DONATION_SETTINGS,

  brandName: BRANDING.brandName,
  brandTagline: BRANDING.brandTagline,
  logoUrl: "",
  primaryColor: BRANDING.primaryColor,
  secondaryColor: BRANDING.secondaryColor,

  headerNotice: "Powering Modern Political Operations & Field Campaigns",

  footerAddress: BRANDING.footerAddress,
  footerPhone: BRANDING.footerPhone,
  footerEmail: BRANDING.supportEmail,
  copyrightText: `© 2026 ${BRANDING.shortName} Platform. ${BRANDING.developerName}. All rights reserved.`,

  senatorialZones: [
    "Enugu East Senatorial Zone",
    "Enugu West Senatorial Zone",
    "Enugu North Senatorial Zone",
  ],

  lgas: [
    "Aninri", "Awgu", "Enugu East", "Enugu North", "Enugu South",
    "Ezeagu", "Igbo Etiti", "Igbo Eze North", "Igbo Eze South", "Isi Uzo",
    "Nkanu East", "Nkanu West", "Nsukka", "Oji River", "Udenu", "Udi", "Uzo Uwani"
  ],

  enabledModules: {
    socialTasks: true,
    leaderboard: true,
    campaignCouncil: true,
    electionOperations: true,
    news: true,
    gallery: true,
    structure: true,
    inecOfficers: true,
    announcements: true,
  },

  terminology: {
    memberLabel: "Member",
    coordinatorLabel: "Coordinator",
    lgaLabel: "LGA / District",
    wardLabel: "Ward",
    campaignLabel: "Political Operations",
  },

  maintenanceMode: false,
  maintenanceScreen: "page",
};

const COLLECTION_NAME = "site_settings";
const DOC_ID = "general";
const LOCAL_STORAGE_KEY = "politicore_site_settings";

/*
 * Deep-merge the nested homepage objects so a settings document that
 * predates a field still resolves every value from the defaults
 * instead of returning `undefined` on the homepage.
 */
function withHomepageDefaults(settings: SiteSettings): SiteSettings {
  return {
    ...DEFAULT_SITE_SETTINGS,
    ...settings,
    donation: {
      ...DEFAULT_DONATION_SETTINGS,
      ...(settings.donation ?? {}),
    },
    campaignCtas:
      Array.isArray(settings.campaignCtas) && settings.campaignCtas.length > 0
        ? settings.campaignCtas
        : DEFAULT_CAMPAIGN_CTAS,
    bioTeaser: { ...DEFAULT_BIO_TEASER, ...(settings.bioTeaser ?? {}) },
    manifestoTeaser: {
      ...DEFAULT_MANIFESTO_TEASER,
      ...(settings.manifestoTeaser ?? {}),
    },
    newsSection: { ...DEFAULT_NEWS_SECTION, ...(settings.newsSection ?? {}) },
    eventsSection: {
      ...DEFAULT_EVENTS_SECTION,
      ...(settings.eventsSection ?? {}),
    },
  };
}

/*
 * Synchronous read of the last cached settings (browser only).
 *
 * Callers seed their state from this before awaiting Firestore so a
 * returning visitor's saved toggles apply on the first client render
 * instead of flashing the defaults while the network responds. It is a
 * seed only: `getSiteSettings()` overwrites it as soon as it resolves.
 */
export function readCachedSiteSettings(): SiteSettings | null {
  if (typeof window === "undefined") return null;

  try {
    const cached = parseCachedSettings(localStorage.getItem(LOCAL_STORAGE_KEY));
    if (!cached) return null;

    return withHomepageDefaults({
      ...DEFAULT_SITE_SETTINGS,
      ...cached,
    } as SiteSettings);
  } catch {
    return null;
  }
}

/*
 * Read the live settings document.
 *
 * Firestore is the source of truth: the localStorage copy is written
 * on every successful read and is ONLY consulted as a fallback when
 * the read fails or times out (offline, cold network, quota). A saved
 * toggle therefore reaches returning visitors on their next load
 * instead of being masked by a stale cached copy.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const docRef = doc(db, COLLECTION_NAME, DOC_ID);
    const fetchPromise = getDoc(docRef);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Firestore fetch timeout")), 2500)
    );

    const docSnap = (await Promise.race([fetchPromise, timeoutPromise])) as any;

    if (docSnap && docSnap.exists()) {
      const data = docSnap.data() as SiteSettings;
      const merged = withHomepageDefaults({
        ...DEFAULT_SITE_SETTINGS,
        ...data,
      });

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
        } catch {
          // Ignore local storage write errors (private mode, quota)
        }
      }

      return merged;
    }
  } catch (err) {
    console.warn("Firestore fetch error/fallback for site settings:", err);
  }

  // Firestore was unreachable, timed out, or the document is missing:
  // fall back to the last successfully cached copy.
  if (typeof window !== "undefined") {
    try {
      const cached = parseCachedSettings(localStorage.getItem(LOCAL_STORAGE_KEY));
      if (cached) {
        return withHomepageDefaults({
          ...DEFAULT_SITE_SETTINGS,
          ...cached,
        } as SiteSettings);
      }
    } catch {
      // Ignore local storage read errors
    }
  }

  return DEFAULT_SITE_SETTINGS;
}

export async function updateSiteSettings(
  settings: Partial<SiteSettings>
): Promise<SiteSettings> {
  const current = await getSiteSettings();
  const updated: SiteSettings = withHomepageDefaults({
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
  });

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error("Local storage update error:", err);
    }
  }

  try {
    const docRef = doc(db, COLLECTION_NAME, DOC_ID);
    await setDoc(
      docRef,
      {
        ...updated,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("Firestore update fallback to local session:", err);
  }

  return updated;
}
