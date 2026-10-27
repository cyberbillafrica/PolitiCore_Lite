"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  ClipboardCheck,
  Copy,
  FileText,
  HandCoins,
  Handshake,
  Heart,
  Loader2,
  MapPin,
  Share2,
  Target,
  Users,
  X,
} from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

import { getPublishedNews } from "@/lib/firebase/firestore";
import { getPublishedUpcomingEvents } from "@/lib/firebase/events";
import { getBiography } from "@/lib/firebase/biography";
import { getManifesto } from "@/lib/firebase/manifesto";
import {
  getSiteSettings,
  readCachedSiteSettings,
  SiteSettings,
  DEFAULT_SITE_SETTINGS,
  DEFAULT_EVENTS_SECTION,
} from "@/lib/firebase/site-settings";
import {
  hasText,
  previewParagraphs,
  sectionVisible,
} from "@/lib/public-content";

import type { NewsArticle, CampaignEvent } from "@/types";

/* ============================================================
 * Homepage composition is FIXED and settings-driven:
 *
 *   Hero -> CTAs -> Biography teaser -> Manifesto teaser -> News -> Events
 *
 * Every section carries a `show` toggle in site settings; a hidden
 * section does not render at all. The former "About PolitiCore",
 * "Core Responsibilities", "Organizational Hierarchy" and bottom
 * CTA banner sections no longer render on the homepage — their
 * full pages (/about, /structure) remain reachable via navigation.
 * ============================================================ */

export default function HomePage() {
  const [latestNews, setLatestNews] = useState<NewsArticle[]>([]);
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [bio, setBio] = useState<{
    about: string;
    fullName: string;
    imageUrl: string | null;
  } | null>(null);
  const [manifestoInfo, setManifestoInfo] = useState<{
    introduction: string;
    title: string;
  } | null>(null);
  const [donateOpen, setDonateOpen] = useState(false);

  useEffect(() => {
    async function loadHomepageData() {
      try {
        setNewsLoading(true);

        /*
         * Seed from the last cached copy first: a returning visitor's
         * saved toggles apply on this commit instead of flashing the
         * defaults, and the Firestore read below overwrites the seed as
         * soon as it resolves.
         */
        const cached = readCachedSiteSettings();
        if (cached) setSettings(cached);
        setSettingsReady(true);

        const siteData = await getSiteSettings();
        setSettings(siteData);

        const newsData = await getPublishedNews(
          Math.max(1, siteData.newsSection?.count ?? 3),
        );
        const eventsData = await getPublishedUpcomingEvents(
          Math.max(1, siteData.eventsSection?.count ?? 3),
        );

        setLatestNews(newsData);
        setEvents(eventsData);

        // Teaser fallbacks come from the published biography/manifesto.
        const bioData = await getBiography();
        if (bioData && bioData.status === "published") {
          setBio({
            about: bioData.about || "",
            fullName: bioData.full_name || "",
            imageUrl: bioData.image_url || null,
          });
        }

        const manifestoData = await getManifesto();
        if (manifestoData && manifestoData.status === "published") {
          setManifestoInfo({
            introduction: manifestoData.introduction || "",
            title: manifestoData.title || "",
          });
        }
      } catch (err) {
        console.error("Failed to load homepage data:", err);
      } finally {
        setNewsLoading(false);
      }
    }

    loadHomepageData();
  }, []);

  function formatDate(rawTimestamp: any): string {
    if (!rawTimestamp) return "Recent";

    let date: Date;

    if (typeof rawTimestamp === "object" && rawTimestamp !== null && "seconds" in rawTimestamp) {
      date = new Date((rawTimestamp as { seconds: number }).seconds * 1000);
    } else if (
      typeof rawTimestamp === "string" ||
      typeof rawTimestamp === "number"
    ) {
      date = new Date(rawTimestamp);
    } else {
      return "Recent";
    }

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  async function copyCta(url?: string) {
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Clipboard unavailable; open the link directly instead
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  }

  /* ────────────────────────────────────────────────────────────
   * Sections are rendered in this exact order and skip cleanly.
   * ──────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 max-w-full overflow-x-hidden text-gray-900 dark:text-gray-100 transition-colors duration-200">
      <Header />

      {/* Placeholder for the single render between hydration and the
          cached-settings seed. Without it the server HTML would paint the
          default toggles before a returning visitor's saved settings
          apply. */}
      {!settingsReady && <HomeSectionsSkeleton />}

      {/* ═════════════ SECTION 1 — HERO (toggle: heroShow) ═════════════ */}
      {settingsReady && settings.heroShow !== false && (
        <section className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-green-950 text-white max-w-full">
          <div className="absolute inset-0 bg-black/30 pointer-events-none" />

          <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
            <div className="grid items-center gap-12 md:grid-cols-12">
              <div className="md:col-span-7">
                {settings.headerNotice && (
                  <div className="mb-6 inline-block rounded-full border border-emerald-400/30 bg-emerald-500/20 px-4 py-1.5 text-xs font-semibold tracking-wide text-emerald-200 backdrop-blur-sm uppercase">
                    {settings.headerNotice}
                  </div>
                )}

                <h1 className="mb-4 text-4xl font-extrabold leading-tight md:text-6xl tracking-tight">
                  {settings.heroTitle}
                </h1>

                {settings.heroTagline && (
                  <p className="mb-6 text-2xl font-semibold text-emerald-300 md:text-3xl">
                    {settings.heroTagline}
                  </p>
                )}

                {settings.heroDescription && (
                  <p className="mb-8 text-base text-gray-200 leading-relaxed md:text-lg max-w-xl">
                    {settings.heroDescription}
                  </p>
                )}

                {/* Hero primary/secondary buttons are configurable
                    in admin settings (heroCtaText / heroCtaLink and
                    the optional heroCta2 pair). */}
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {settings.heroCtaText && (
                    <Link
                      href={settings.heroCtaLink || "/about"}
                      className="inline-flex items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-600 px-7 py-3.5 font-black text-gray-950 shadow-xl transition-all border border-amber-400"
                    >
                      {settings.heroCtaText}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  )}

                  {settings.heroCta2Text && (
                    <Link
                      href={settings.heroCta2Link || "#"}
                      className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3.5 font-bold text-white shadow-lg transition-all hover:bg-emerald-600"
                    >
                      {settings.heroCta2Text}
                    </Link>
                  )}
                </div>
              </div>

              <div className="md:col-span-5 flex justify-center">
                {settings.heroImageUrl ? (
                  <div className="relative w-full max-w-md aspect-[4/5] rounded-3xl overflow-hidden shadow-2xl border-4 border-emerald-500/30 bg-gray-900">
                    <Image
                      src={settings.heroImageUrl}
                      alt={settings.heroTitle}
                      fill
                      unoptimized
                      priority
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-full max-w-md rounded-2xl border border-emerald-400/20 bg-white/10 p-8 backdrop-blur-md shadow-2xl space-y-6">
                    <h3 className="text-xl font-bold text-white border-b border-emerald-400/30 pb-3">
                      Campaign Operations &amp; Intelligence
                    </h3>

                    <div className="space-y-4">
                      <div className="flex items-start space-x-3">
                        <div className="mt-1 rounded-lg bg-emerald-500/20 p-2 text-emerald-300 border border-emerald-400/30">
                          <Users className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-base text-emerald-200">
                            Stakeholder Engagement
                          </h4>
                          <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                            Centralize leadership relationships, grassroots networks, and field coordination.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <div className="mt-1 rounded-lg bg-emerald-500/20 p-2 text-emerald-300 border border-emerald-400/30">
                          <Target className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-base text-emerald-200">
                            Field Operations &amp; Tasks
                          </h4>
                          <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                            Deploy coordinators and track real-time field reports across all geographical zones.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═════════════ SECTION 2 — CTAs (Volunteer / Donate / Contact / Share) ═════════════ */}
      {(() => {
        if (!settingsReady) return null;

        const donationEnabled = settings.donation?.donateEnabled ?? false;
        const ctas = (settings.campaignCtas ?? []).filter(
          (cta) =>
            cta.enabled &&
            // Donate is hidden entirely (not greyed out) whenever the
            // donation setup is toggled off in admin settings.
            (cta.kind !== "donate" || donationEnabled),
        );
        if (ctas.length === 0) return null;

        const iconFor = (kind: string) => {
          if (kind === "donate") return HandCoins;
          if (kind === "share") return Share2;
          if (kind === "contact") return Users;
          if (kind === "volunteer") return Handshake;
          return Heart;
        };

        return (
          <section className="bg-white dark:bg-gray-900 py-14">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col justify-center items-center gap-4 sm:flex-row sm:flex-wrap">
                {ctas.map((cta) => {
                  const Icon = iconFor(cta.kind);
                  const isPrimary = cta.kind === "donate";

                  const baseClass =
                    "inline-flex items-center justify-center rounded-xl px-8 py-4 font-bold shadow-lg transition-all" +
                    (isPrimary
                      ? " bg-amber-500 text-gray-950 hover:bg-amber-600 border border-amber-400"
                      : " border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60");

                  if (cta.kind === "donate") {
                    return (
                      <button
                        key={cta.id}
                        type="button"
                        onClick={() => setDonateOpen(true)}
                        className={baseClass}
                      >
                        <Icon className="mr-2 h-5 w-5" />
                        {cta.label}
                      </button>
                    );
                  }

                  if (cta.kind === "share") {
                    return (
                      <button
                        key={cta.id}
                        type="button"
                        onClick={() => copyCta(cta.link)}
                        className={baseClass}
                      >
                        <Icon className="mr-2 h-5 w-5" />
                        {cta.label}
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={cta.id}
                      href={cta.link || "/volunteer"}
                      className={baseClass}
                    >
                      <Icon className="mr-2 h-5 w-5" />
                      {cta.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })()}

      {/* ═════════════ SECTION 3 — BIOGRAPHY TEASER ═════════════ */}
      {settingsReady && sectionVisible(settings.bioTeaser) && (
        <section className="bg-gray-50 dark:bg-gray-950 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                About the Candidate
              </p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
                {settings.bioTeaser?.heading}
              </h2>
            </div>

            <div className="grid items-start gap-10 md:grid-cols-12">
              {/* Candidate portrait */}
              <div className="md:col-span-4">
                {(() => {
                  const portrait =
                    settings.bioTeaser?.imageUrl || bio?.imageUrl || null;
                  if (!portrait) {
                    return (
                      <div className="flex aspect-[3/4] w-full items-center justify-center rounded-3xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900/40 dark:text-emerald-200/40">
                        <div className="text-center p-6">
                          <Users className="mx-auto mb-3 h-10 w-10" />
                          <span className="text-lg font-bold tracking-wide uppercase">
                            {bio?.fullName || settings.brandName}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl shadow-2xl bg-gray-100 dark:bg-gray-900">
                      <Image
                        src={portrait}
                        alt={bio?.fullName || settings.bioTeaser?.heading || "Candidate portrait"}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  );
                })()}
              </div>

              {/* Teaser body */}
              <div className="md:col-span-8">
                {(() => {
                  // The teaser body is always the published biography's
                  // `about` (biographies/main) — one source of truth.
                  const body = bio?.about || "";
                  const paragraphs = previewParagraphs(body);

                  if (paragraphs.length === 0) {
                    return (
                      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                        The candidate&apos;s story will be published here soon.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-5">
                      {paragraphs.map((para, idx) => (
                        <p
                          key={idx}
                          className="text-gray-600 dark:text-gray-300 leading-relaxed md:text-lg"
                        >
                          {para}
                        </p>
                      ))}

                      {/* "Read Full Biography" — label and link are
                          configurable in admin settings. */}
                      <Link
                        href={settings.bioTeaser?.buttonLink || "/biography"}
                        className="mt-2 inline-flex items-center justify-center rounded-xl bg-emerald-700 px-7 py-3.5 font-bold text-white shadow-lg transition-all hover:bg-emerald-800"
                      >
                        <FileText className="mr-2 h-5 w-5" />
                        {settings.bioTeaser?.buttonLabel}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Link>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═════════════ SECTION 4 — MANIFESTO TEASER ═════════════ */}
      {settingsReady && sectionVisible(settings.manifestoTeaser) && (
        <section className="bg-gradient-to-br from-emerald-950 to-green-950 py-16 text-white max-w-full">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
                Our Vision
              </p>
              <h2 className="mt-2 text-3xl font-bold md:text-4xl">
                {settings.manifestoTeaser?.heading}
              </h2>
            </div>

            {(() => {
              const body =
                settings.manifestoTeaser?.body ||
                manifestoInfo?.introduction ||
                "";
              const paragraphs = previewParagraphs(body);

              if (paragraphs.length === 0) {
                return (
                  <p className="mb-8 text-center text-emerald-100/80">
                    The manifesto will be published here soon.
                  </p>
                );
              }

              return (
                <div className="space-y-5 mb-10">
                  {paragraphs.map((para, idx) => (
                    <p
                      key={idx}
                      className="text-emerald-50/90 leading-relaxed md:text-lg text-center"
                    >
                      {para}
                    </p>
                  ))}
                </div>
              );
            })()}

            <div className="flex justify-center">
              <Link
                href={settings.manifestoTeaser?.buttonLink || "/manifesto"}
                className="inline-flex items-center justify-center rounded-xl bg-white px-8 py-4 font-black text-emerald-950 shadow-xl transition-all hover:bg-emerald-50"
              >
                <ClipboardCheck className="mr-2 h-5 w-5" />
                {settings.manifestoTeaser?.buttonLabel}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ═════════════ SECTION 5 — NEWS (existing; count + heading configurable) ═════════════ */}
      {settingsReady && sectionVisible(settings.newsSection) && (
        <section className="bg-gray-50 dark:bg-gray-950 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 flex items-center justify-between">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
                {settings.newsSection?.heading}
              </h2>

              {/* "See all news" label + link are configurable. */}
              <Link
                href={settings.newsSection?.seeAllLink || "/news"}
                className="font-semibold text-emerald-700 dark:text-emerald-400 transition-colors hover:text-emerald-800"
              >
                {settings.newsSection?.seeAllLabel}
              </Link>
            </div>

            {newsLoading ? null : latestNews.length === 0 ? null : (
              <div className="grid gap-8 md:grid-cols-3">
                {latestNews.map((article) => (
                  <Link
                    key={article.id}
                    href={`/news/${article.slug}`}
                    className="group flex flex-col overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
                  >
                    {article.featured_image ? (
                      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gray-100">
                        <Image
                          src={article.featured_image}
                          alt={article.title}
                          fill
                          unoptimized
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          sizes="(max-width: 768px) 100vw, 33vw"
                        />
                      </div>
                    ) : (
                      <div className="relative flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-emerald-900/10 to-emerald-700/10">
                        <span className="text-2xl font-bold text-emerald-900/20 dark:text-emerald-400/20">
                          DCM Enugu
                        </span>
                      </div>
                    )}

                    <div className="flex flex-1 flex-col p-6">
                      <div className="mb-2 flex items-center text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-emerald-700" />
                          {formatDate(article.published_at || article.created_at)}
                        </span>
                      </div>

                      <h3 className="mb-2 line-clamp-2 text-lg font-bold text-gray-900 dark:text-white transition-colors group-hover:text-emerald-700">
                        {article.title}
                      </h3>

                      <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                        {article.excerpt || article.content}
                      </p>

                      <div className="inline-flex items-center text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        Read story
                        <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═════════════ SECTION 6 — EVENTS (upcoming; heading/count configurable) ═════════════ */}
      {(() => {
        if (!settingsReady) return null;

        const eventsCfg = settings.eventsSection ?? DEFAULT_EVENTS_SECTION;
        if (!sectionVisible(eventsCfg)) return null;

        if (events.length === 0) return null; // hidden, no empty placeholder

        return (
          <section className="bg-white dark:bg-gray-900 py-16">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="mb-12">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
                  {eventsCfg.heading}
                </h2>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-6 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 dark:bg-emerald-950 px-3 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(event.date)}
                      {event.time ? ` · ${event.time}` : ""}
                    </div>

                    <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">
                      {event.title}
                    </h3>

                    {event.description && (
                      <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                        {event.description}
                      </p>
                    )}

                    {hasText(event.venue) && (
                      <div className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                        <MapPin className="h-4 w-4 text-emerald-700" />
                        {event.venue}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })()}

      <Footer />

      {/* ═══════════════════════════════════════════════════════
          DONATE MODAL — manual bank transfer details from
          site settings. Fires when the Donate CTA is clicked.
      ═══════════════════════════════════════════════════════ */}
      {donateOpen && settings.donation?.donateEnabled && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Donation bank details"
          onClick={() => setDonateOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDonateOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Close donation dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 dark:bg-amber-950/50 p-2.5 text-amber-700 dark:text-amber-400">
                <HandCoins className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-gray-900 dark:text-white">
                  Donate to the Campaign
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Direct bank transfer — no online payment required
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { label: "Bank Name", value: settings.donation.bankName },
                { label: "Account Name", value: settings.donation.accountName },
                { label: "Account Number", value: settings.donation.accountNumber },
              ].map((field) => (
                <div
                  key={field.label}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {field.label}
                    </p>
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {field.value || "—"}
                    </p>
                  </div>
                  {field.value && (
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(field.value || "")}
                      className="shrink-0 rounded-lg p-2 text-emerald-700 transition-colors hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-950"
                      aria-label={`Copy ${field.label}`}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {settings.donation.donationNote && (
              <p className="mt-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-xs leading-relaxed text-emerald-900 dark:text-emerald-200">
                {settings.donation.donationNote}
              </p>
            )}

            <p className="mt-4 text-center text-[11px] text-gray-400">
              After transferring, your support is recorded by the finance desk.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * Neutral placeholder while the settings seed resolves (one commit on
 * hydration). It mirrors the hero + CTA + teaser heights so the content
 * swap does not shift the page.
 */
function HomeSectionsSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="h-72 bg-gray-200 dark:bg-gray-900 sm:h-96" />

      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-wrap justify-center gap-4">
          <div className="h-14 w-56 rounded-xl bg-gray-200 dark:bg-gray-800" />
          <div className="h-14 w-40 rounded-xl bg-gray-200 dark:bg-gray-800" />
          <div className="h-14 w-40 rounded-xl bg-gray-200 dark:bg-gray-800" />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="mt-8 grid gap-10 md:grid-cols-12">
          <div className="h-80 rounded-3xl bg-gray-200 dark:bg-gray-800 md:col-span-4" />
          <div className="space-y-3 md:col-span-8">
            <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-11/12 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-10/12 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-9/12 rounded bg-gray-200 dark:bg-gray-800" />
          </div>
        </div>
      </div>
    </div>
  );
}
