import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";

export interface SiteSettings {
  // Hero Section
  heroTitle: string;
  heroTagline: string;
  heroDescription: string;
  heroCtaText: string;
  heroCtaLink: string;
  heroImageUrl: string;

  // Branding & Logo
  brandName: string;
  brandTagline: string;
  logoUrl: string;

  // Header & Navigation
  headerNotice?: string;

  // Footer & Contact Information
  footerAddress: string;
  footerPhone: string;
  footerEmail: string;
  copyrightText: string;

  // Maintenance Mode Settings
  maintenanceMode: boolean;
  maintenanceScreen: "page" | "dark_blue";

  updatedAt?: any;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  heroTitle: "POLITICORE LITE",
  heroTagline: "Political Operations & Campaign Intelligence Platform",
  heroDescription:
    "Bringing political organization, stakeholders, grassroots outreach, field operations, communications, events, reporting, and organizational coordination into one coherent system.",
  heroCtaText: "Explore Platform Features",
  heroCtaLink: "/about",
  heroImageUrl: "",

  brandName: "POLITICORE",
  brandTagline: "POLITICAL OPERATIONS PLATFORM",
  logoUrl: "",

  headerNotice: "Powering Modern Political Operations & Field Campaigns",

  footerAddress: "PolitiCore Operations Center, Headquarters",
  footerPhone: "+234 800 765 4842",
  footerEmail: "contact@politicore.org",
  copyrightText: "© 2026 PolitiCore Platform. CyberBill Africa. All rights reserved.",

  maintenanceMode: false,
  maintenanceScreen: "page",
};

const COLLECTION_NAME = "site_settings";
const DOC_ID = "general";
const LOCAL_STORAGE_KEY = "politicore_site_settings";

export async function getSiteSettings(): Promise<SiteSettings> {
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        return { ...DEFAULT_SITE_SETTINGS, ...JSON.parse(cached) };
      }
    } catch {
      // Ignore local storage parse error
    }
  }

  try {
    const docRef = doc(db, COLLECTION_NAME, DOC_ID);
    const fetchPromise = getDoc(docRef);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Firestore fetch timeout")), 2500)
    );

    const docSnap = (await Promise.race([fetchPromise, timeoutPromise])) as any;

    if (docSnap && docSnap.exists()) {
      const data = docSnap.data() as SiteSettings;
      const merged = { ...DEFAULT_SITE_SETTINGS, ...data };
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
      }
      return merged;
    }
  } catch (err) {
    console.warn("Firestore fetch error/fallback for site settings:", err);
  }

  return DEFAULT_SITE_SETTINGS;
}

export async function updateSiteSettings(
  settings: Partial<SiteSettings>
): Promise<SiteSettings> {
  const current = await getSiteSettings();
  const updated: SiteSettings = {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
  };

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
