import { doc, getDoc } from "firebase/firestore";
import { db } from "./config";

/**
 * Single-campaign application identity.
 *
 * PolitiCore is deployed once per campaign. There is no
 * multi-organization routing or per-deployment source editing:
 * the campaign display
 * name lives in one Firestore document (`config/app`) and can be
 * changed from the admin settings without a redeploy.
 */
export const APP_CONFIG_ID = "app";
const CONFIG_COLLECTION = "config";

/**
 * Read the campaign display name from the single config doc.
 *
 * Falls back to a neutral default when the doc is absent or
 * unreachable so the public site still renders.
 */
export async function getAppName(): Promise<string> {
  try {
    const snap = await getDoc(doc(db, CONFIG_COLLECTION, APP_CONFIG_ID));
    if (snap.exists()) {
      const data = snap.data() as { name?: string };
      if (data.name) return data.name;
    }
  } catch (error) {
    console.error("Error fetching app config:", error);
  }

  return "PolitiCore Operations Platform";
}
