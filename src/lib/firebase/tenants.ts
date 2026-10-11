/**
 * Current campaign tenant.
 *
 * Keep this as the single source of truth for tenant-aware
 * Firestore records until the application supports selecting
 * between multiple campaigns/tenants dynamically.
 */
export const CURRENT_TENANT_ID = "ifeanyi-2027";
// src/lib/firebase/tenants.ts

import { doc, getDoc } from "firebase/firestore";
import { db } from "./config";

/**
 * Current campaign tenant.
 * Keep this as the single source of truth for tenant-aware
 * Firestore records until the application supports selecting
 * between multiple campaigns/tenants dynamically.
 */

/**
 * Get the current tenant context.
 * For now, returns the static tenant. Later, this will resolve
 * from subdomain or user context.
 */
let cachedTenantPromise: Promise<{ id: string; name: string }> | null = null;

export async function getCurrentTenant(): Promise<{ id: string; name: string }> {
  if (cachedTenantPromise) {
    return cachedTenantPromise;
  }

  const promise = (async () => {
    try {
      const ref = doc(db, "tenants", CURRENT_TENANT_ID);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
        return {
          id: CURRENT_TENANT_ID,
          name: data.name || "Ifeanyi 2027",
        };
      }
    } catch (error) {
      console.error("Error fetching tenant:", error);
    }
    return null;
  })();

  const result = await promise;

  if (result) {
    // Only cache successful Firestore reads
    cachedTenantPromise = Promise.resolve(result);
    return result;
  }

  // Fallback return if Firestore read failed or doc did not exist
  return {
    id: CURRENT_TENANT_ID,
    name: "Ifeanyi 2027",
  };
}

/**
 * Get tenant by subdomain (for future multi-tenant support)
 */
export async function getTenantBySubdomain(subdomain: string): Promise<{ id: string; name: string } | null> {
  try {
    // Query tenants collection by subdomain
    // This assumes you have a 'subdomain' field in tenant documents
    // For now, this is a placeholder
    const ref = doc(db, "tenants", subdomain);
    const snap = await getDoc(ref);
    
    if (snap.exists()) {
      const data = snap.data();
      return {
        id: snap.id,
        name: data.name || subdomain,
      };
    }
  } catch (error) {
    console.error("Error fetching tenant by subdomain:", error);
  }
  
  return null;
}