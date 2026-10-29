"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getSiteSettings,
  updateSiteSettings,
  SiteSettings,
  DEFAULT_SITE_SETTINGS,
  DEFAULT_BIO_TEASER,
  DEFAULT_MANIFESTO_TEASER,
  DEFAULT_NEWS_SECTION,
  DEFAULT_EVENTS_SECTION,
  DEFAULT_CAMPAIGN_CTAS,
  DEFAULT_DONATION_SETTINGS,
  type CampaignCta,
  type BiographyTeaserConfig,
  type ManifestoTeaserConfig,
  type NewsSectionConfig,
  type EventsSectionConfig,
  type DonationSettings,
} from "@/lib/firebase/site-settings";
import { BRANDING } from "@/config/branding";
import { resolveElectionTarget } from "@/lib/election-countdown";
import { useToast } from "@/components/ui/toast";
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
  Phone,
  Mail,
  MapPin,
  ShieldAlert,
  Power,
  Monitor,
  Building2,
  Map,
  ToggleLeft,
  Tag,
  Plus,
  Trash2,
  Vote,
  ArrowRight,
  Coins,
  Newspaper,
  CalendarDays,
  UserRound,
  ScrollText,
} from "lucide-react";

export default function AdminSettingsPage() {
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [newZone, setNewZone] = useState("");
  const [newLga, setNewLga] = useState("");
  const [activeTab, setActiveTab] = useState<
    "organization" | "homepage" | "election" | "branding" | "geography" | "modules" | "terminology" | "header_footer" | "theme" | "maintenance"
  >("organization");

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
      toast.success("Site Settings saved successfully!");
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save site settings:", err);
      toast.error("Failed to save settings. Please try again.");
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
      toast.warning("Image size should be less than 2MB.");
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

  // Nested homepage-config setters (deep-write into site settings).
  const setBioTeaser = (patch: Partial<BiographyTeaserConfig>) =>
    setSettings((prev) => ({
      ...prev,
      bioTeaser: { ...(prev.bioTeaser ?? DEFAULT_BIO_TEASER), ...patch },
    }));
  const setManifestoTeaser = (patch: Partial<ManifestoTeaserConfig>) =>
    setSettings((prev) => ({
      ...prev,
      manifestoTeaser: { ...(prev.manifestoTeaser ?? DEFAULT_MANIFESTO_TEASER), ...patch },
    }));
  const setNewsSection = (patch: Partial<NewsSectionConfig>) =>
    setSettings((prev) => ({
      ...prev,
      newsSection: { ...(prev.newsSection ?? DEFAULT_NEWS_SECTION), ...patch },
    }));
  const setEventsSection = (patch: Partial<EventsSectionConfig>) =>
    setSettings((prev) => ({
      ...prev,
      eventsSection: { ...(prev.eventsSection ?? DEFAULT_EVENTS_SECTION), ...patch },
    }));
  const setDonation = (patch: Partial<DonationSettings>) =>
    setSettings((prev) => ({
      ...prev,
      donation: { ...(prev.donation ?? DEFAULT_DONATION_SETTINGS), ...patch },
    }));
  const setCta = (id: string, patch: Partial<CampaignCta>) =>
    setSettings((prev) => ({
      ...prev,
      campaignCtas: (prev.campaignCtas ?? DEFAULT_CAMPAIGN_CTAS).map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    }));

  const bioTeaser = settings.bioTeaser ?? DEFAULT_BIO_TEASER;
  const manifestoTeaser = settings.manifestoTeaser ?? DEFAULT_MANIFESTO_TEASER;
  const news = settings.newsSection ?? DEFAULT_NEWS_SECTION;
  const events = settings.eventsSection ?? DEFAULT_EVENTS_SECTION;
  const donation = settings.donation ?? DEFAULT_DONATION_SETTINGS;
  const campaignCtas = settings.campaignCtas ?? DEFAULT_CAMPAIGN_CTAS;
  const electionTarget = resolveElectionTarget(settings.electionDate);

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

      {/*
        Election Control Center.

        The election controls (cycles, the active contest, parties and
        candidates) live on their own page; this is the settings-menu
        entry point to it. Nothing below is changed by this link.
      */}
      <Link
        href="/portal/admin/election"
        className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 px-5 py-4 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
            <Vote className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold text-gray-900 dark:text-white">
              Election Control Center
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
              Configure election cycles, the active contest, political parties
              and candidates.
            </p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
      </Link>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
        {[
          { id: "organization", label: "Organization Info", icon: Building2 },
          { id: "homepage", label: "Homepage", icon: Layout },
          { id: "election", label: "Election Countdown", icon: CalendarDays },
          { id: "branding", label: "Logo & Branding", icon: ImageIcon },
          { id: "geography", label: "Geographic Hierarchy", icon: Map },
          { id: "modules", label: "Active Modules", icon: ToggleLeft },
          { id: "terminology", label: "Custom Labels", icon: Tag },
          { id: "header_footer", label: "Header & Footer", icon: Globe },
          { id: "theme", label: `Theme (${theme.toUpperCase()})`, icon: theme === "dark" ? Moon : Sun },
          { id: "maintenance", label: `Maintenance ${settings.maintenanceMode ? "(ACTIVE)" : ""}`, icon: ShieldAlert },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as "organization" | "homepage" | "election" | "branding" | "geography" | "modules" | "terminology" | "header_footer" | "theme" | "maintenance")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                tab.id === "maintenance" && settings.maintenanceMode
                  ? "bg-amber-600 text-white shadow-sm"
                  : isActive
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* TAB 0: ORGANIZATION METADATA */}
        {activeTab === "organization" && (
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800">
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-700" />
                Organization Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={settings.organizationName || ""}
                    onChange={(e) => setSettings({ ...settings, organizationName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Short Name / Abbreviation
                  </label>
                  <input
                    type="text"
                    value={settings.organizationShortName || ""}
                    onChange={(e) => setSettings({ ...settings, organizationShortName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                  Organization Description & Mandate
                </label>
                <textarea
                  rows={3}
                  value={settings.organizationDescription || ""}
                  onChange={(e) => setSettings({ ...settings, organizationDescription: e.target.value })}
                  className="w-full p-4 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Organization Type
                  </label>
                  <input
                    type="text"
                    value={settings.organizationType || ""}
                    onChange={(e) => setSettings({ ...settings, organizationType: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Country
                  </label>
                  <input
                    type="text"
                    value={settings.country || ""}
                    onChange={(e) => setSettings({ ...settings, country: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    State / Region
                  </label>
                  <input
                    type="text"
                    value={settings.stateRegion || ""}
                    onChange={(e) => setSettings({ ...settings, stateRegion: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
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

              {/* Hero visibility toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                <div>
                  <h3 className="font-extrabold text-sm text-gray-900 dark:text-white">
                    Hero Section Visible
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    When hidden, the entire hero section is removed from the homepage.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({ ...settings, heroShow: settings.heroShow === false })
                  }
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                    settings.heroShow !== false
                      ? "bg-emerald-700 text-white"
                      : "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {settings.heroShow !== false ? "SHOWN" : "HIDDEN"}
                </button>
              </div>

              {/* Secondary hero CTA (optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Secondary CTA Button Label (optional)
                  </label>
                  <input
                    type="text"
                    value={settings.heroCta2Text || ""}
                    onChange={(e) => setSettings({ ...settings, heroCta2Text: e.target.value })}
                    placeholder="Leave empty to hide the secondary button"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Secondary CTA Target Route (optional)
                  </label>
                  <input
                    type="text"
                    value={settings.heroCta2Link || ""}
                    onChange={(e) => setSettings({ ...settings, heroCta2Link: e.target.value })}
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
              {/* ── CAMPAIGN CTAs ── */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
                <div>
                  <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-emerald-700" />
                    Campaign Action Buttons (CTAs)
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Buttons are rendered below the hero, in the order listed.
                    The Donate button opens the bank-transfer details modal and
                    only appears when donations are enabled below.
                  </p>
                </div>

                {campaignCtas.map((cta) => (
                  <div
                    key={cta.id}
                    className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                        {cta.kind === "donate" ? "Donate (opens modal)" : cta.kind}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCta(cta.id, { enabled: !cta.enabled })}
                          className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all ${
                            cta.enabled
                              ? "bg-emerald-700 text-white"
                              : "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {cta.enabled ? "SHOWN" : "HIDDEN"}
                        </button>
                        {cta.kind !== "donate" && (
                          <button
                            type="button"
                            onClick={() =>
                              setSettings({
                                ...settings,
                                campaignCtas: campaignCtas.filter((c) => c.id !== cta.id),
                              })
                            }
                            className="text-red-500 hover:text-red-700"
                            aria-label={`Remove ${cta.label} CTA`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Button label"
                        value={cta.label}
                        onChange={(e) => setCta(cta.id, { label: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-xs"
                      />
                      {cta.kind !== "donate" ? (
                        <input
                          type="text"
                          placeholder="Link target (e.g. /volunteer)"
                          value={cta.link}
                          onChange={(e) => setCta(cta.id, { link: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-xs"
                        />
                      ) : (
                        <div className="px-3 py-2.5 text-xs text-gray-400 italic">
                          Opens the donation bank-details modal
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex items-center gap-3 flex-wrap">
                  {(campaignCtas.length > 0
                    ? [
                        { kind: "volunteer" as const, label: "Add Volunteer button" },
                        { kind: "link" as const, label: "Add custom link button" },
                      ]
                    : []).map((opt) => (
                    <button
                      key={opt.kind}
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          campaignCtas: [
                            ...campaignCtas,
                            {
                              id: `cta-${Date.now()}`,
                              label:
                                opt.kind === "volunteer"
                                  ? "Volunteer for the Campaign"
                                  : "New Action",
                              link: opt.kind === "volunteer" ? "/volunteer" : "/",
                              kind: opt.kind,
                              enabled: true,
                            },
                          ],
                        })
                      }
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> {opt.label}
                    </button>
                  ))}
                  {campaignCtas.length === 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({ ...settings, campaignCtas: DEFAULT_CAMPAIGN_CTAS })
                      }
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold"
                    >
                      Restore default CTA set
                    </button>
                  )}
                </div>
              </div>

              {/* ── BIOGRAPHY TEASER ── */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-emerald-700" />
                      Biography Teaser
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Body text always comes from the published biography document (Admin &rarr; Biography). The portrait falls back to it when the field above is empty.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBioTeaser({ show: !bioTeaser.show })}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                      bioTeaser.show
                        ? "bg-emerald-700 text-white"
                        : "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {bioTeaser.show ? "SHOWN" : "HIDDEN"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Section Heading
                    </label>
                    <input
                      type="text"
                      value={bioTeaser.heading}
                      onChange={(e) => setBioTeaser({ heading: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Candidate Portrait Image URL (optional)
                    </label>
                    <input
                      type="text"
                      value={bioTeaser.imageUrl}
                      onChange={(e) => setBioTeaser({ imageUrl: e.target.value })}
                      placeholder="Falls back to the biography document image"
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Button Label
                    </label>
                    <input
                      type="text"
                      value={bioTeaser.buttonLabel}
                      onChange={(e) => setBioTeaser({ buttonLabel: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Button Link
                    </label>
                    <input
                      type="text"
                      value={bioTeaser.buttonLink}
                      onChange={(e) => setBioTeaser({ buttonLink: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* ── MANIFESTO TEASER ── */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                      <ScrollText className="h-4 w-4 text-emerald-700" />
                      Manifesto Teaser
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Body text falls back to the published manifesto introduction when empty.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManifestoTeaser({ show: !manifestoTeaser.show })}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                      manifestoTeaser.show
                        ? "bg-emerald-700 text-white"
                        : "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {manifestoTeaser.show ? "SHOWN" : "HIDDEN"}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Section Heading
                  </label>
                  <input
                    type="text"
                    value={manifestoTeaser.heading}
                    onChange={(e) => setManifestoTeaser({ heading: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Teaser Body (2–3 paragraphs; blank lines separate paragraphs)
                  </label>
                  <textarea
                    rows={5}
                    value={manifestoTeaser.body}
                    onChange={(e) => setManifestoTeaser({ body: e.target.value })}
                    className="w-full p-4 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Button Label
                    </label>
                    <input
                      type="text"
                      value={manifestoTeaser.buttonLabel}
                      onChange={(e) => setManifestoTeaser({ buttonLabel: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Button Link
                    </label>
                    <input
                      type="text"
                      value={manifestoTeaser.buttonLink}
                      onChange={(e) => setManifestoTeaser({ buttonLink: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* ── NEWS SECTION ── */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                    <Newspaper className="h-4 w-4 text-emerald-700" />
                    News Section
                  </h3>
                  <button
                    type="button"
                    onClick={() => setNewsSection({ show: !news.show })}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                      news.show
                        ? "bg-emerald-700 text-white"
                        : "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {news.show ? "SHOWN" : "HIDDEN"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Section Heading
                    </label>
                    <input
                      type="text"
                      value={news.heading}
                      onChange={(e) => setNewsSection({ heading: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Number of Articles
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={news.count}
                      onChange={(e) =>
                        setNewsSection({ count: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      "See All" Button Label
                    </label>
                    <input
                      type="text"
                      value={news.seeAllLabel}
                      onChange={(e) => setNewsSection({ seeAllLabel: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      "See All" Button Link
                    </label>
                    <input
                      type="text"
                      value={news.seeAllLink}
                      onChange={(e) => setNewsSection({ seeAllLink: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* ── EVENTS SECTION ── */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-emerald-700" />
                    Events Section
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEventsSection({ show: !events.show })}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                      events.show
                        ? "bg-emerald-700 text-white"
                        : "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {events.show ? "SHOWN" : "HIDDEN"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Section Heading
                    </label>
                    <input
                      type="text"
                      value={events.heading}
                      onChange={(e) => setEventsSection({ heading: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Number of Events
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={events.count}
                      onChange={(e) =>
                        setEventsSection({ count: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* ── DONATE CONFIGURATION ── */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                      <Coins className="h-4 w-4 text-amber-600" />
                      Donate — Manual Bank Transfer
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Accepts direct transfers only. Details are shown publicly in the donate modal.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDonation({ donateEnabled: !donation.donateEnabled })}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                      donation.donateEnabled
                        ? "bg-emerald-700 text-white"
                        : "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {donation.donateEnabled ? "ENABLED" : "DISABLED"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={donation.bankName}
                      onChange={(e) => setDonation({ bankName: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Account Name
                    </label>
                    <input
                      type="text"
                      value={donation.accountName}
                      onChange={(e) => setDonation({ accountName: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={donation.accountNumber}
                      onChange={(e) => setDonation({ accountNumber: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Donation Note / Reference Instructions (optional)
                  </label>
                  <input
                    type="text"
                    value={donation.donationNote}
                    onChange={(e) => setDonation({ donationNote: e.target.value })}
                    placeholder='e.g. "For enquiries, WhatsApp +234..." or reference format'
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                {donation.donateEnabled &&
                  (!donation.bankName || !donation.accountName || !donation.accountNumber) && (
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Donations are enabled but bank details are incomplete — fill all three
                      fields before going live.
                    </p>
                  )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* TAB: ELECTION COUNTDOWN */}
        {activeTab === "election" && (
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800">
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-emerald-700" />
                Election Countdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="max-w-md">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                  Election Date
                </label>
                <input
                  type="date"
                  value={settings.electionDate ?? ""}
                  onChange={(e) =>
                    setSettings({ ...settings, electionDate: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  The homepage counts down to midnight (West Africa Time) on
                  this date. Leave the field blank to use the platform default,
                  and save to publish the change on the next homepage load.
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-5">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Homepage countdown target
                </p>
                <p className="mt-1 text-lg font-black text-gray-900 dark:text-white">
                  {electionTarget.label}
                </p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                  {electionTarget.fromSettings
                    ? "This date is saved in site settings."
                    : "No date saved yet — the platform default above is live."}
                </p>
              </div>

              {settings.electionDate ? (
                <button
                  type="button"
                  onClick={() =>
                    setSettings({ ...settings, electionDate: "" })
                  }
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Clear date and use platform default
                </button>
              ) : null}
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
                      {BRANDING.monogram}
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

        {/* TAB GEOGRAPHY */}
        {activeTab === "geography" && (
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800">
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Map className="h-5 w-5 text-emerald-700" />
                Geographic Hierarchy & Zone Management
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Senatorial Zones */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-3">
                  Senatorial Zones / Regions
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(settings.senatorialZones || []).map((zone, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-900 dark:text-emerald-200"
                    >
                      {zone}
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (settings.senatorialZones || []).filter((_, i) => i !== idx);
                          setSettings({ ...settings, senatorialZones: updated });
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add new Zone..."
                    value={newZone}
                    onChange={(e) => setNewZone(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newZone.trim()) {
                        setSettings({
                          ...settings,
                          senatorialZones: [...(settings.senatorialZones || []), newZone.trim()],
                        });
                        setNewZone("");
                      }
                    }}
                    className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                </div>
              </div>

              {/* LGAs */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-3">
                  Local Government Areas / Districts
                </label>
                <div className="flex flex-wrap gap-2 mb-3 max-h-48 overflow-y-auto">
                  {(settings.lgas || []).map((lga, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-800 dark:text-gray-200"
                    >
                      {lga}
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (settings.lgas || []).filter((_, i) => i !== idx);
                          setSettings({ ...settings, lgas: updated });
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add new LGA / District..."
                    value={newLga}
                    onChange={(e) => setNewLga(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newLga.trim()) {
                        setSettings({
                          ...settings,
                          lgas: [...(settings.lgas || []), newLga.trim()],
                        });
                        setNewLga("");
                      }
                    }}
                    className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* TAB MODULES */}
        {activeTab === "modules" && (
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800">
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ToggleLeft className="h-5 w-5 text-emerald-700" />
                Active Application Module Toggles
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Enable or disable operational modules across the platform interface and portal navigation.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {[
                  { key: "campaignCouncil", label: "Political Operations Council" },
                  { key: "electionOperations", label: "Electoral / Field Officer Operations" },
                  { key: "socialTasks", label: "Social Member Tasks" },
                  { key: "leaderboard", label: "Leaderboard & Points" },
                  { key: "news", label: "News & Articles" },
                  { key: "gallery", label: "Media Gallery" },
                  { key: "structure", label: "Organization Structure" },
                  { key: "inecOfficers", label: "Field Officers Roster" },
                  { key: "announcements", label: "Announcements & Broadcasts" },
                ].map((mod) => {
                  const isEnabled = settings.enabledModules?.[mod.key as keyof typeof settings.enabledModules] ?? true;
                  return (
                    <div
                      key={mod.key}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700"
                    >
                      <span className="text-xs font-extrabold text-gray-900 dark:text-white">
                        {mod.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSettings({
                            ...settings,
                            enabledModules: {
                              ...settings.enabledModules,
                              [mod.key]: !isEnabled,
                            },
                          });
                        }}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                          isEnabled
                            ? "bg-emerald-700 text-white"
                            : "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {isEnabled ? "ENABLED" : "DISABLED"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* TAB TERMINOLOGY */}
        {activeTab === "terminology" && (
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800">
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Tag className="h-5 w-5 text-emerald-700" />
                Custom Terminology & Labels
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Member Label
                  </label>
                  <input
                    type="text"
                    value={settings.terminology?.memberLabel || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        terminology: { ...settings.terminology, memberLabel: e.target.value },
                      })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Coordinator Label
                  </label>
                  <input
                    type="text"
                    value={settings.terminology?.coordinatorLabel || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        terminology: { ...settings.terminology, coordinatorLabel: e.target.value },
                      })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    LGA / District Label
                  </label>
                  <input
                    type="text"
                    value={settings.terminology?.lgaLabel || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        terminology: { ...settings.terminology, lgaLabel: e.target.value },
                      })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Ward Label
                  </label>
                  <input
                    type="text"
                    value={settings.terminology?.wardLabel || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        terminology: { ...settings.terminology, wardLabel: e.target.value },
                      })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"
                  />
                </div>
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
                      Polished, centered card featuring the {BRANDING.shortName} logo, app name, and a clear &quot;We&apos;ll be back soon&quot; message.
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

