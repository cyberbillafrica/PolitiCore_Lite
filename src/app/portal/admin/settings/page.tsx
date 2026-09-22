"use client";

import { useEffect, useState } from "react";
import {
  getSiteSettings,
  updateSiteSettings,
  SiteSettings,
  DEFAULT_SITE_SETTINGS,
} from "@/lib/firebase/site-settings";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Settings,
  Image as ImageIcon,
  Sun,
  Moon,
  Layout,
  Globe,
  Save,
  CheckCircle2,
  Upload,
  AlertCircle,
  Loader2,
  Type,
  Phone,
  Mail,
  MapPin,
  ShieldAlert,
  Power,
  Monitor,
} from "lucide-react";

export default function AdminSettingsPage() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"homepage" | "branding" | "header_footer" | "theme" | "maintenance">("homepage");

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await getSiteSettings();
        setSettings(data);
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      const updated = await updateSiteSettings(settings);
      setSettings(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save site settings:", err);
      alert("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Image Upload helper (converts to base64 data URL for local storage / firestore preview)
  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "heroImageUrl" | "logoUrl"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Image size should be less than 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSettings((prev) => ({ ...prev, [field]: reader.result }));
      }
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-700 mb-2" />
        <p className="text-sm font-semibold">Loading Control Center Settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-10">
      {/* Page Title & Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
            <Settings className="h-7 w-7 text-emerald-700 dark:text-emerald-400" />
            Central Site Control Center
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Customize homepage hero, logos, header notice, contact info, and theme preferences.
          </p>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm shadow-md transition-all self-start sm:self-auto"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving Changes...
            </>
          ) : savedSuccess ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-200" />
              Saved Successfully!
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Control Settings
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("homepage")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "homepage"
              ? "bg-emerald-700 text-white shadow-sm"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          <Layout className="h-4 w-4" />
          Homepage Hero
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("branding")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "branding"
              ? "bg-emerald-700 text-white shadow-sm"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          Logo & Branding
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("header_footer")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "header_footer"
              ? "bg-emerald-700 text-white shadow-sm"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          <Globe className="h-4 w-4" />
          Header & Footer
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("theme")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "theme"
              ? "bg-emerald-700 text-white shadow-sm"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          Theme Mode ({theme.toUpperCase()})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("maintenance")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "maintenance"
              ? "bg-amber-600 text-white shadow-sm"
              : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          Maintenance Mode {settings.maintenanceMode && "(ACTIVE)"}
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* TAB 1: HOMEPAGE HERO SETTINGS */}
        {activeTab === "homepage" && (
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800">
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Layout className="h-5 w-5 text-emerald-700" />
                Homepage Hero Section Customization
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Hero Title & Tagline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Hero Main Headline
                  </label>
                  <input
                    type="text"
                    value={settings.heroTitle}
                    onChange={(e) => setSettings({ ...settings, heroTitle: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Hero Sub-Tagline
                  </label>
                  <input
                    type="text"
                    value={settings.heroTagline}
                    onChange={(e) => setSettings({ ...settings, heroTagline: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>
              </div>

              {/* Description Paragraph */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                  Hero Body Copy / Description
                </label>
                <textarea
                  rows={3}
                  value={settings.heroDescription}
                  onChange={(e) => setSettings({ ...settings, heroDescription: e.target.value })}
                  className="w-full p-4 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                />
              </div>

              {/* Call-to-Action Text & Link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Primary CTA Button Label
                  </label>
                  <input
                    type="text"
                    value={settings.heroCtaText}
                    onChange={(e) => setSettings({ ...settings, heroCtaText: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Primary CTA Target Route
                  </label>
                  <input
                    type="text"
                    value={settings.heroCtaLink}
                    onChange={(e) => setSettings({ ...settings, heroCtaLink: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>
              </div>

              {/* Hero Image Section */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                  Hero Background / Banner Image
                </label>

                {settings.heroImageUrl ? (
                  <div className="relative rounded-2xl overflow-hidden border border-gray-300 dark:border-gray-700 max-h-56 bg-gray-900 flex items-center justify-center">
                    <img
                      src={settings.heroImageUrl}
                      alt="Hero Background Preview"
                      className="w-full h-56 object-cover opacity-80"
                    />
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, heroImageUrl: "" })}
                      className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 shadow-lg"
                    >
                      Remove Hero Image
                    </button>
                  </div>
                ) : (
                  <div className="p-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl text-center bg-white dark:bg-gray-900">
                    <ImageIcon className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      No custom Hero image uploaded. The homepage will display default gradient theme styling.
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all shadow-sm">
                    <Upload className="h-4 w-4" />
                    Upload New Hero Image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e, "heroImageUrl")}
                    />
                  </label>

                  <input
                    type="url"
                    placeholder="or paste Image URL directly..."
                    value={settings.heroImageUrl}
                    onChange={(e) => setSettings({ ...settings, heroImageUrl: e.target.value })}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* TAB 2: LOGO & BRANDING */}
        {activeTab === "branding" && (
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800">
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-emerald-700" />
                Site Logo & Identity Branding
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={settings.brandName}
                    onChange={(e) => setSettings({ ...settings, brandName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Brand Sub-title / Tagline
                  </label>
                  <input
                    type="text"
                    value={settings.brandTagline}
                    onChange={(e) => setSettings({ ...settings, brandTagline: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>
              </div>

              {/* Logo Image Upload */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                  Custom Site Logo Icon
                </label>

                <div className="flex items-center gap-6">
                  {settings.logoUrl ? (
                    <div className="relative p-2 bg-white rounded-2xl border border-gray-300 dark:border-gray-700 shadow-sm">
                      <img src={settings.logoUrl} alt="Logo Preview" className="h-16 w-16 object-contain" />
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-2xl bg-emerald-700 text-white font-extrabold flex items-center justify-center text-xl shadow-md">
                      DCM
                    </div>
                  )}

                  <div className="space-y-2 flex-1">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all">
                      <Upload className="h-4 w-4" />
                      Upload Logo Image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, "logoUrl")}
                      />
                    </label>

                    {settings.logoUrl && (
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, logoUrl: "" })}
                        className="block text-xs font-bold text-red-600 hover:underline"
                      >
                        Reset to default text badge
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* TAB 3: HEADER & FOOTER CONTENT */}
        {activeTab === "header_footer" && (
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800">
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Globe className="h-5 w-5 text-emerald-700" />
                Header Notice & Footer Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Header Notice Banner */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                  Header Top Notice / Tagline Banner
                </label>
                <input
                  type="text"
                  value={settings.headerNotice || ""}
                  onChange={(e) => setSettings({ ...settings, headerNotice: e.target.value })}
                  placeholder="e.g. Mobilizing for Good Governance in Enugu State"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                />
              </div>

              {/* Contact Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-emerald-700" /> Phone Contact Number
                  </label>
                  <input
                    type="text"
                    value={settings.footerPhone}
                    onChange={(e) => setSettings({ ...settings, footerPhone: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-emerald-700" /> Email Contact Address
                  </label>
                  <input
                    type="email"
                    value={settings.footerEmail}
                    onChange={(e) => setSettings({ ...settings, footerEmail: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-emerald-700" /> Official Secretariat Physical Address
                </label>
                <input
                  type="text"
                  value={settings.footerAddress}
                  onChange={(e) => setSettings({ ...settings, footerAddress: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                />
              </div>

              {/* Copyright Text */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                  Footer Copyright Line
                </label>
                <input
                  type="text"
                  value={settings.copyrightText}
                  onChange={(e) => setSettings({ ...settings, copyrightText: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* TAB 4: THEME SELECTION (FOR ALL LOGGED IN MEMBERS) */}
        {activeTab === "theme" && (
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800">
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {theme === "dark" ? <Moon className="h-5 w-5 text-emerald-400" /> : <Sun className="h-5 w-5 text-amber-500" />}
                Theme Control Center (Light & Dark Mode)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Select your preferred application display theme. Theme changes apply instantly for logged-in members.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Basic Light Mode */}
                <div
                  onClick={() => setTheme("light")}
                  className={`cursor-pointer rounded-2xl p-6 border-2 transition-all flex items-center gap-4 ${
                    theme === "light"
                      ? "border-emerald-600 bg-emerald-50/50 text-gray-900 shadow-md"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shrink-0">
                    <Sun className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base">Basic Light Mode</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Bright, clean civic interface with high-contrast emerald highlights.
                    </p>
                  </div>
                </div>

                {/* Basic Dark Mode */}
                <div
                  onClick={() => setTheme("dark")}
                  className={`cursor-pointer rounded-2xl p-6 border-2 transition-all flex items-center gap-4 ${
                    theme === "dark"
                      ? "border-emerald-500 bg-gray-800 text-white shadow-md"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-900 text-indigo-300 shrink-0">
                    <Moon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base">Basic Dark Mode</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Low-glare dark aesthetic for comfortable nighttime portal operation.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* TAB 5: MAINTENANCE MODE */}
        {activeTab === "maintenance" && (
          <Card className="dark:bg-gray-900 dark:border-gray-800 border-amber-200 dark:border-amber-900/50">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800 bg-amber-50/50 dark:bg-amber-950/20">
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                Maintenance Mode Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="bg-amber-50 dark:bg-amber-950/40 p-4 rounded-xl border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                  Temporarily replace the public application with a maintenance experience for visitors.
                  Administrators remain authorized to access the Settings Control Center to manage or disable maintenance mode.
                </p>
              </div>

              {/* Maintenance Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                <div>
                  <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                    <Power className={`h-4 w-4 ${settings.maintenanceMode ? "text-red-500" : "text-gray-400"}`} />
                    Maintenance Mode Status
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Currently {settings.maintenanceMode ? "ENABLED (Visitors will see selected maintenance view)" : "DISABLED (Normal public interface active)"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!settings.maintenanceMode) {
                      setShowConfirmModal(true);
                    } else {
                      setSettings({ ...settings, maintenanceMode: false });
                    }
                  }}
                  className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all shadow-sm flex items-center gap-2 ${
                    settings.maintenanceMode
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-emerald-700 text-white hover:bg-emerald-800"
                  }`}
                >
                  <Power className="h-4 w-4" />
                  Maintenance Mode: {settings.maintenanceMode ? "ON" : "OFF"}
                </button>
              </div>

              {/* Visitor Screen Selection (When ON or configurable) */}
              <div className="space-y-3 pt-2">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Visitor Screen Experience
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Option 1: Maintenance Page */}
                  <div
                    onClick={() => setSettings({ ...settings, maintenanceScreen: "page" })}
                    className={`cursor-pointer rounded-2xl p-5 border-2 transition-all ${
                      settings.maintenanceScreen === "page"
                        ? "border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30 text-gray-900 dark:text-white shadow-sm"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Monitor className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                      <h4 className="font-extrabold text-sm">Maintenance Page</h4>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      Polished, centered card featuring the DCM Enugu logo, app name, and a clear "We'll be back soon" message.
                    </p>
                  </div>

                  {/* Option 2: Dark Blue Screen */}
                  <div
                    onClick={() => setSettings({ ...settings, maintenanceScreen: "dark_blue" })}
                    className={`cursor-pointer rounded-2xl p-5 border-2 transition-all ${
                      settings.maintenanceScreen === "dark_blue"
                        ? "border-emerald-600 bg-slate-900 text-white shadow-sm"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-4 w-4 rounded-full bg-slate-900 border border-slate-600 shrink-0" />
                      <h4 className="font-extrabold text-sm">Dark Blue Screen</h4>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Minimal full viewport deep navy screen with no header, navigation, or public cards displayed.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </form>

      {/* Confirmation Modal for Enabling Maintenance Mode */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-8 w-8 shrink-0" />
              <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">Enable Maintenance Mode?</h3>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Enabling maintenance mode will replace public pages with the selected screen.
              Authorized administrators will still be able to sign in and access the control center.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettings({ ...settings, maintenanceMode: true });
                  setShowConfirmModal(false);
                }}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
              >
                Confirm & Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
