// src/app/portal/admin/structure/page.tsx

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Loader2,
  Plus,
  Trash2,
  Edit2,
  User,
  Phone,
  Mail,
  MapPin,
  Upload,
  AlertCircle,
  CheckCircle,
  X,
  Layers,
  Building2,
  ShieldCheck,
  Eye,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { getCurrentTenant } from "@/lib/firebase/tenants";
import {
  getStructureMembers,
  saveStructureMember,
  deleteStructureMember,
  StructureMember,
} from "@/lib/firebase/structure";
import { uploadToCloudinary } from "@/lib/cloudinary";

export default function AdminStructurePage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<StructureMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [formMember, setFormMember] = useState<Partial<StructureMember>>({
    name: "",
    position: "",
    altTitle: "",
    zone: "",
    level: "STATE",
    phone: "",
    email: "",
    ward: "",
    image_url: null,
    display_order: 1,
  });

  // ─── AUTH GUARD ───
  useEffect(() => {
    if (authLoading) return;
    if (!profile || profile.access_role !== "admin") {
      router.replace("/portal/dashboard");
    }
  }, [authLoading, profile, router]);

  // ─── LOAD MEMBERS ───
  const loadMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const tenant = await getCurrentTenant();
      const list = await getStructureMembers(tenant.id);
      setMembers(list);
    } catch (err) {
      console.error("Failed to load structure members:", err);
      setError("Failed to load structure members.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && profile?.access_role === "admin") {
      loadMembers();
    }
  }, [authLoading, profile, loadMembers]);

  // ─── HANDLERS ───
  const handleOpenCreate = () => {
    setFormMember({
      name: "",
      position: "",
      altTitle: "",
      zone: "",
      level: "STATE",
      phone: "",
      email: "",
      ward: "",
      image_url: null,
      display_order: members.length + 1,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (member: StructureMember) => {
    setFormMember({ ...member });
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const url = await uploadToCloudinary(file, "ifeanyi-2027/candidate");
      setFormMember((prev) => ({ ...prev, image_url: url }));
    } catch (err) {
      console.error("Image upload failed:", err);
      setError("Failed to upload image.");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMember.name?.trim() || !formMember.position?.trim()) {
      setError("Full name and position are required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const tenant = await getCurrentTenant();
      await saveStructureMember(tenant.id, {
        id: formMember.id || "",
        name: formMember.name.trim(),
        position: formMember.position.trim(),
        altTitle: formMember.altTitle?.trim() || "",
        zone: formMember.zone?.trim() || "",
        level: formMember.level || "STATE",
        phone: formMember.phone?.trim() || "",
        email: formMember.email?.trim() || "",
        ward: formMember.ward?.trim() || "",
        image_url: formMember.image_url || null,
        display_order: Number(formMember.display_order) || 1,
      });

      setSuccess("Structure member saved successfully!");
      setIsModalOpen(false);
      await loadMembers();
    } catch (err) {
      console.error("Error saving structure member:", err);
      setError("Failed to save structure member.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    try {
      await deleteStructureMember(id);
      setSuccess(`Deleted ${name}.`);
      await loadMembers();
    } catch (err) {
      console.error("Failed to delete structure member:", err);
      setError("Failed to delete structure member.");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
        <span className="ml-3 text-gray-500">Loading structure manager...</span>
      </div>
    );
  }

  if (!profile || profile.access_role !== "admin") return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Our Structure Management
          </h1>
          <p className="text-sm text-gray-500">
            Manage State, Zonal, and Local Government structure personnel.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/structure"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 text-sm"
          >
            <Eye className="h-4 w-4" />
            Preview
          </a>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 text-sm shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Structure Member
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)}>
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
          <button onClick={() => setSuccess(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* List by Levels */}
      {["STATE", "ZONAL", "LGA"].map((levelKey) => {
        const levelMembers = members.filter((m) => m.level === levelKey);
        const levelTitle =
          levelKey === "STATE"
            ? "State Structure"
            : levelKey === "ZONAL"
            ? "Zonal Structure"
            : "Local Government Structure";

        return (
          <div
            key={levelKey}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                {levelKey === "STATE" && (
                  <ShieldCheck className="h-5 w-5 text-emerald-700" />
                )}
                {levelKey === "ZONAL" && (
                  <Layers className="h-5 w-5 text-emerald-700" />
                )}
                {levelKey === "LGA" && (
                  <Building2 className="h-5 w-5 text-emerald-700" />
                )}
                {levelTitle} ({levelMembers.length})
              </h2>
            </div>

            {levelMembers.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center border border-dashed rounded-lg">
                No members added for {levelTitle}.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {levelMembers.map((member) => (
                  <div
                    key={member.id}
                    className="p-4 rounded-lg border border-gray-200 bg-gray-50/50 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start gap-3">
                        <div className="relative h-12 w-12 shrink-0 rounded-full border bg-white overflow-hidden flex items-center justify-center">
                          {member.image_url ? (
                            <Image
                              src={member.image_url}
                              alt={member.name}
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          ) : (
                            <User className="h-6 w-6 text-gray-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-gray-900 text-sm truncate">
                            {member.name}
                          </h3>
                          <p className="text-xs font-medium text-emerald-700 truncate">
                            {member.position}
                          </p>
                          {member.ward && (
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {member.ward}
                            </p>
                          )}
                        </div>
                      </div>

                      {(member.phone || member.email) && (
                        <div className="mt-3 pt-2 border-t border-gray-200/60 text-xs text-gray-600 space-y-1">
                          {member.phone && (
                            <p className="flex items-center gap-1.5">
                              <Phone className="h-3 w-3 text-gray-400 shrink-0" />
                              {member.phone}
                            </p>
                          )}
                          {member.email && (
                            <p className="flex items-center gap-1.5 truncate">
                              <Mail className="h-3 w-3 text-gray-400 shrink-0" />
                              {member.email}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-2 border-t border-gray-200 flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEdit(member)}
                        className="p-1.5 text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(member.id, member.name)}
                        className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-lg font-bold text-gray-900">
                {formMember.id
                  ? "Edit Structure Member"
                  : "Add Structure Member"}
              </h2>
              <button onClick={() => setIsModalOpen(false)}>
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={formMember.name || ""}
                  onChange={(e) =>
                    setFormMember({ ...formMember, name: e.target.value })
                  }
                  placeholder="e.g. Chief John Nnamani"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              {/* Alt Title / Traditional Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Traditional Title / Honorific (Optional)
                </label>
                <input
                  type="text"
                  value={formMember.altTitle || ""}
                  onChange={(e) =>
                    setFormMember({ ...formMember, altTitle: e.target.value })
                  }
                  placeholder="e.g. Eze Ana Eri Ifeya On'enwe Amuri 1 of Enugu State"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              {/* Senatorial Zone */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Senatorial Zone (Optional)
                </label>
                <input
                  type="text"
                  value={formMember.zone || ""}
                  onChange={(e) =>
                    setFormMember({ ...formMember, zone: e.target.value })
                  }
                  placeholder="e.g. Enugu East Senatorial Zone"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              {/* Position */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Position *
                </label>
                <input
                  type="text"
                  required
                  value={formMember.position || ""}
                  onChange={(e) =>
                    setFormMember({ ...formMember, position: e.target.value })
                  }
                  placeholder="e.g. Zonal Coordinator, Enugu East"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              {/* Structure Level */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Organizational Level *
                </label>
                <select
                  value={formMember.level || "STATE"}
                  onChange={(e) =>
                    setFormMember({
                      ...formMember,
                      level: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="STATE">State Structure</option>
                  <option value="ZONAL">Zonal Structure</option>
                  <option value="LGA">Local Government Structure</option>
                </select>
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    value={formMember.phone || ""}
                    onChange={(e) =>
                      setFormMember({ ...formMember, phone: e.target.value })
                    }
                    placeholder="+234..."
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formMember.email || ""}
                    onChange={(e) =>
                      setFormMember({ ...formMember, email: e.target.value })
                    }
                    placeholder="email@example.com"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* Ward & Display Order */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Ward / LGA Location
                  </label>
                  <input
                    type="text"
                    value={formMember.ward || ""}
                    onChange={(e) =>
                      setFormMember({ ...formMember, ward: e.target.value })
                    }
                    placeholder="e.g. Agbani Ward 1"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formMember.display_order || 1}
                    onChange={(e) =>
                      setFormMember({
                        ...formMember,
                        display_order: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* Profile Image */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Profile Photo
                </label>
                {formMember.image_url ? (
                  <div className="relative h-20 w-20 border rounded-lg overflow-hidden">
                    <Image
                      src={formMember.image_url}
                      alt="Preview"
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormMember({ ...formMember, image_url: null })
                      }
                      className="absolute top-1 right-1 bg-black/60 p-1 text-white rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    <Upload className="h-3.5 w-3.5" />
                    {uploadingImage ? "Uploading..." : "Upload Photo"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploadingImage}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
