import { doc, getDoc } from "firebase/firestore";
import { db } from "./config";

/**
 * Single-Tenant PolitiCore Organization Identifier
 */
export const CURRENT_TENANT_ID = "politicore-default";

/**
 * Get the single-tenant organization context.
 */
export async function getCurrentTenant(): Promise<{ id: string; name: string }> {
  try {
    const ref = doc(db, "tenants", CURRENT_TENANT_ID);
    const snap = await getDoc(ref);
    
    if (snap.exists()) {
      const data = snap.data();
      return {
        id: CURRENT_TENANT_ID,
        name: data.name || "PolitiCore Operations Platform",
      };
    }
  } catch (error) {
    console.error("Error fetching organization settings:", error);
  }
  
  return {
    id: CURRENT_TENANT_ID,
    name: "PolitiCore Operations Platform",
  };
}
