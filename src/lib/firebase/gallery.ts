// src/lib/firebase/gallery.ts

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import type { GalleryData, GalleryImage } from "@/types";

const COLLECTION = "galleries";

export async function getGallery(
  tenantId: string,
): Promise<GalleryData | null> {
  try {
    const ref = doc(db, COLLECTION, tenantId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as GalleryData;
  } catch (error) {
    console.error("Error fetching gallery:", error);
    return null;
  }
}

export async function updateGallery(
  tenantId: string,
  data: GalleryData,
): Promise<void> {
  const ref = doc(db, COLLECTION, tenantId);
  await setDoc(
    ref,
    {
      ...data,
      tenant_id: tenantId,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function addGalleryImage(
  tenantId: string,
  image: Omit<GalleryImage, "id" | "uploaded_at">,
): Promise<void> {
  const gallery = await getGallery(tenantId);
  // Use client-side timestamp instead of serverTimestamp()
  const newImage: GalleryImage = {
    ...image,
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    uploaded_at: new Date().toISOString(), // ✅ client timestamp
  };
  const images = gallery?.images || [];
  await updateGallery(tenantId, {
    tenant_id: tenantId,
    images: [newImage, ...images],
  });
}

export async function removeGalleryImage(
  tenantId: string,
  imageId: string,
): Promise<void> {
  const gallery = await getGallery(tenantId);
  if (!gallery) return;

  await updateGallery(tenantId, {
    tenant_id: tenantId,
    images: gallery.images.filter((img) => img.id !== imageId),
  });
}

