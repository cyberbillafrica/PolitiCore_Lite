/**
 * Cloudinary Upload Utility
 *
 * The folder root is per-client and comes from
 * NEXT_PUBLIC_CLOUDINARY_FOLDER_PREFIX (see src/config/branding.ts).
 * Always build folders with `cloudinaryFolder("news")` rather than
 * concatenating strings, so the prefix is applied exactly once.
 *
 * Conventions:
 * - News: cloudinaryFolder("news")
 * - Gallery: cloudinaryFolder("gallery")
 * - Candidate: cloudinaryFolder("candidate")
 * - Campaign Members: cloudinaryFolder("campaign-members")
 * - Manifestos: cloudinaryFolder("candidate/manifestos")
 */

import { BRANDING } from "@/config/branding";
if (typeof window !== "undefined") {
  console.log(
    "Cloudinary debug:",
    JSON.stringify({
      name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      preset: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
    }),
  );
}

export const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";

export const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

/** Folder root, normalised so it never produces `//` in a path. */
export const CLOUDINARY_FOLDER_PREFIX = BRANDING.cloudinaryFolderPrefix
  .replace(/^\/+/, "")
  .replace(/\/+$/, "");

/**
 * Build a Cloudinary folder for this deployment, e.g.
 * `cloudinaryFolder("news")` -> `"<prefix>/news"`.
 *
 * Widen from the old literal union to `string`: the folder names are
 * a runtime concern now, and the prefix is validated by
 * scripts/verify-clone.ts.
 */
export type CloudinaryFolder = string;

export function cloudinaryFolder(subfolder: string): string {
  const clean = subfolder
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  return [CLOUDINARY_FOLDER_PREFIX, clean].filter(Boolean).join("/");
}

// ─────────────────────────────────────────────
// IMAGE UPLOAD (existing)
// ─────────────────────────────────────────────

export async function uploadToCloudinary(
  file: File,
  folder: CloudinaryFolder = cloudinaryFolder("news"),
): Promise<string> {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      "Invalid file type. Only JPG, PNG, and WebP images are allowed.",
    );
  }

  const maxSize = 5 * 1024 * 1024; // 5 MB
  if (file.size > maxSize) {
    throw new Error("File size exceeds 5MB limit.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", folder);

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message ||
        `Cloudinary upload failed with status ${response.status}`,
    );
  }

  const data = await response.json();
  if (!data.secure_url) {
    throw new Error("Cloudinary upload succeeded but no URL was returned.");
  }

  return data.secure_url;
}

// ─────────────────────────────────────────────
// PDF UPLOAD (new – for manifestos)
// ─────────────────────────────────────────────

/**
 * Upload a PDF file to Cloudinary.
 * Default folder: cloudinaryFolder("candidate") – pass a subfolder like
 * cloudinaryFolder("candidate/manifestos") for manifestos.
 */
export async function uploadPDFToCloudinary(
  file: File,
  folder: string = cloudinaryFolder("candidate"),
): Promise<string> {
  // Validate file type
  if (file.type !== "application/pdf") {
    throw new Error("Invalid file type. Only PDF files are allowed.");
  }

  // Validate size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10 MB
  if (file.size > maxSize) {
    throw new Error("File size exceeds 10MB limit.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", folder);

  // IMPORTANT: Tell Cloudinary this is a raw file (not an image)
  formData.append("resource_type", "raw");

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`;

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message ||
        `Cloudinary upload failed with status ${response.status}`,
    );
  }

  const data = await response.json();
  if (!data.secure_url) {
    throw new Error("Cloudinary upload succeeded but no URL was returned.");
  }

  return data.secure_url;
}
