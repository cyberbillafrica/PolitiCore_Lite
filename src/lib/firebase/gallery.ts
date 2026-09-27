// src/lib/firebase/gallery.ts

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import type { GalleryData, GalleryImage } from "@/types";

const COLLECTION = "galleries";
const DOC_ID = "main";

/**
 * Read the campaign gallery (flat doc `galleries/main`).
 */
export async function getGallery(): Promise<GalleryData | null> {
  try {
    const ref = doc(db, COLLECTION, DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as GalleryData;
  } catch (error) {
    console.error("Error fetching gallery:", error);
    return null;
  }
}

export async function updateGallery(
  data: GalleryData,
): Promise<void> {
  const ref = doc(db, COLLECTION, DOC_ID);
  await setDoc(
    ref,
    {
      ...data,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function addGalleryImage(
  image: Omit<GalleryImage, "id" | "uploaded_at">,
): Promise<void> {
  const gallery = await getGallery();
  const newImage: GalleryImage = {
    ...image,
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    uploaded_at: new Date().toISOString(),
  };
  const images = gallery?.images || [];
  await updateGallery({
    images: [newImage, ...images],
  });
}

export async function removeGalleryImage(
  imageId: string,
): Promise<void> {
  const gallery = await getGallery();
  if (!gallery) return;

  await updateGallery({
    images: gallery.images.filter((img) => img.id !== imageId),
  });
}
