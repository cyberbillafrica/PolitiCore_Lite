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
  heroTitle: "DCM ENUGU",
  heroTagline: "Directorate of Contact and Mobilization",
  heroDescription:
    "Serving as a relationship-management, stakeholder-engagement, grassroots outreach, coordination, and mobilization structure across Enugu State.",
  heroCtaText: "Register as INEC Officer",
  heroCtaLink: "/register-inec-officer",
  heroImageUrl: "",

  brandName: "DCM ENUGU",
  brandTagline: "DIRECTORATE OF CONTACT & MOBILIZATION",
  logoUrl: "",

  headerNotice: "Mobilizing for Good Governance in Enugu State",

  footerAddress: "DCM Secretariat, Independence Layout, Enugu State, Nigeria",
  footerPhone: "+234 800 000 0000",
  footerEmail: "contact@dcmenugu.org",
  copyrightText: "© 2026 DCM Enugu (Directorate of Contact and Mobilization). All rights reserved.",

  maintenanceMode: false,
  maintenanceScreen: "page",
};

const COLLECTION_NAME = "site_settings";
const DOC_ID = "general";
const LOCAL_STORAGE_KEY = "dcm_enugu_site_settings";

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
