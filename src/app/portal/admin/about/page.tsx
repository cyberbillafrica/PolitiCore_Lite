// src/app/portal/admin/about/page.tsx

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Loader2,
  Save,
  Eye,
  CheckCircle,
  AlertCircle,
  FileText,
  X,
  Upload,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { getBiography, updateBiography } from "@/lib/firebase/biography";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { getCurrentTenant } from "@/lib/firebase/tenants";
import type { BiographyData } from "@/types";

const DEFAULT_ABOUT: Omit<
  BiographyData,
  "tenant_id" | "created_at" | "updated_at"
> = {
  full_name: "DCM Enugu Directorate",
  title: "Directorate of Contact and Mobilization",
  about: "",
  image_url: null,
  stats: {
    years_experience: 0,
    communities_served: 0,
    volunteers: 0,
  },
  social_links: {
    facebook: "",
    x: "",
    instagram: "",
    tiktok: "",
  },
  status: "draft",
};

export default function AdminAboutPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aboutData, setAboutData] = useState<BiographyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // ─── AUTH GUARD ───

  useEffect(() => {
    if (authLoading) return;
    if (!profile || profile.access_role !== "admin") {
      router.replace("/portal/dashboard");
    }
  }, [authLoading, profile, router]);

  // ─── LOAD ───

  const loadAboutContent = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const tenant = await getCurrentTenant();
      const data = await getBiography(tenant.id);

      if (data) {
        setAboutData(data);
      } else {
        setAboutData({
          ...DEFAULT_ABOUT,
          tenant_id: tenant.id,
        } as BiographyData);
      }
    } catch (err) {
      console.error("Failed to load About Us content:", err);
      setError("Unable to load About Us content. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && profile?.access_role === "admin") {
      loadAboutContent();
    }
  }, [authLoading, profile, loadAboutContent]);

  // ─── SAVE ───

  const handleSave = async (status: "draft" | "published") => {
    if (!aboutData) return;

    if (!aboutData.about.trim()) {
      setError("About Us content description is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const tenant = await getCurrentTenant();
      await updateBiography(tenant.id, {
        ...aboutData,
        full_name: aboutData.full_name || "DCM Enugu Directorate",
        title: aboutData.title || "Directorate of Contact and Mobilization",
        status,
      });
      setSuccess(
        `About Us content ${status === "published" ? "published" : "saved as draft"} successfully!`,
      );
      await loadAboutContent();
    } catch (err) {
      console.error("Failed to save About Us content:", err);
      setError("Failed to save About Us content. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ─── IMAGE UPLOAD ───

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setError(null);

    try {
      const tenant = await getCurrentTenant();
      const url = await uploadToCloudinary(file, "ifeanyi-2027/candidate");
      setAboutData((prev) => {
        if (!prev) return prev;
        return { ...prev, image_url: url };
      });
      setSuccess("Image uploaded successfully!");
    } catch (err) {
      console.error("Failed to upload image:", err);
      setError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  const removeImage = () => {
    setAboutData((prev) => {
      if (!prev) return prev;
      return { ...prev, image_url: null };
    });
  };

  // ─── LOADING ───

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
        <span className="ml-3 text-gray-500">Loading About Us editor...</span>
      </div>
    );
  }

  if (!profile || profile.access_role !== "admin") {
    return null;
  }

  if (!aboutData) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Unable to load About Us content.</p>
          <button
            onClick={loadAboutContent}
            className="mt-4 text-emerald-700 hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isPublished = aboutData.status === "published";

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">About Us Editor</h1>
          <p className="text-sm text-gray-500">
            Manage the content presented on the public About Us page.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              isPublished
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {isPublished ? (
              <>
                <CheckCircle className="h-4 w-4" />
                Published
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Draft
              </>
            )}
          </span>

          <button
            onClick={() => handleSave("draft")}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Draft"}
          </button>

          <button
            onClick={() => handleSave(isPublished ? "draft" : "published")}
            disabled={saving}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 ${
              isPublished
                ? "bg-yellow-500 text-white hover:bg-yellow-600"
                : "bg-emerald-700 text-white hover:bg-emerald-800"
            }`}
          >
            {isPublished ? (
              <>
                <X className="h-4 w-4" />
                Unpublish
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Publish
              </>
            )}
          </button>

          <a
            href="/about"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
          >
            <Eye className="h-4 w-4" />
            Preview
          </a>
        </div>
      </div>

      {/* ─── NOTIFICATIONS ─── */}
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <span>{success}</span>
          </div>
          <button
            onClick={() => setSuccess(null)}
            className="text-green-500 hover:text-green-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── FORM ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
        {/* Title / Heading */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Organization / Headline Title
          </label>
          <input
            value={aboutData.title}
            onChange={(e) => setAboutData({ ...aboutData, title: e.target.value })}
            placeholder="e.g. Directorate of Contact and Mobilization"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
          />
        </div>

        {/* About Us Main Content */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            About Us Content / Overview *
          </label>
          <textarea
            rows={8}
            value={aboutData.about}
            onChange={(e) => setAboutData({ ...aboutData, about: e.target.value })}
            placeholder="Write the detailed About Us overview for DCM Enugu..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
          />
        </div>

        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Featured / Secretariat Image
          </label>
          <div className="space-y-3">
            {aboutData.image_url ? (
              <div className="relative w-48 aspect-[4/5] overflow-hidden rounded-lg border bg-gray-100">
                <Image
                  src={aboutData.image_url}
                  alt="Featured image"
                  fill
                  unoptimized
                  className="object-cover"
                />
                <button
                  onClick={removeImage}
                  className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 transition-colors">
                  <Upload className="h-4 w-4" />
                  {uploadingImage ? "Uploading..." : "Upload Image"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-gray-500">
                  JPG, PNG, WebP • Max 5MB
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
