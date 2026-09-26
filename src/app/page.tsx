"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  ArrowRight,
  Users,
  Target,
  Heart,
  Loader2,
  FileText,
} from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

import { getPublishedNews } from "@/lib/firebase/firestore";
import { getCurrentTenant } from "@/lib/firebase/tenants";
import { getPublishedEvents } from "@/lib/firebase/portal-content";
import { getSiteSettings, SiteSettings, DEFAULT_SITE_SETTINGS } from "@/lib/firebase/site-settings";

import type { NewsArticle, EventData } from "@/types";

export default function HomePage() {
  const [latestNews, setLatestNews] = useState<NewsArticle[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);

  useEffect(() => {
    async function loadHomepageData() {
      try {
        setNewsLoading(true);

        const [tenant, siteData] = await Promise.all([
          getCurrentTenant(),
          getSiteSettings(),
        ]);

        setSettings(siteData);

        const newsData = await getPublishedNews(3);
        const eventsData = await getPublishedEvents(tenant.id);

        setLatestNews(newsData);
        setEvents(eventsData);
      } catch (err) {
        console.error("Failed to load homepage data:", err);
      } finally {
        setNewsLoading(false);
      }
    }

    loadHomepageData();
  }, []);

  function formatDate(rawTimestamp: any) {
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 max-w-full overflow-x-hidden text-gray-900 dark:text-gray-100 transition-colors duration-200">
      <Header />

      {/* =========================================================
          HERO SECTION (DYNAMIC SIDE CANDIDATE IMAGE)
      ========================================================= */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-green-950 text-white max-w-full">
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
          <div className="grid items-center gap-12 md:grid-cols-12">
            {/* Hero Content Column */}
            <div className="md:col-span-7">
              <div className="mb-6 inline-block rounded-full border border-emerald-400/30 bg-emerald-500/20 px-4 py-1.5 text-xs font-semibold tracking-wide text-emerald-200 backdrop-blur-sm uppercase">
                {settings.headerNotice || "PolitiCore • Political Operations & Campaign Platform"}
              </div>

              <h1 className="mb-4 text-4xl font-extrabold leading-tight md:text-6xl tracking-tight">
                {settings.heroTitle}
              </h1>

              <p className="mb-6 text-2xl font-semibold text-emerald-300 md:text-3xl">
                {settings.heroTagline}
              </p>

              <p className="mb-8 text-base text-gray-200 leading-relaxed md:text-lg max-w-xl">
                {settings.heroDescription}
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href="/biography"
                  className="inline-flex items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-600 px-7 py-3.5 font-black text-gray-950 shadow-xl transition-all border border-amber-400"
                >
                  Candidate Biography
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>

                <Link
                  href="/manifesto"
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3.5 font-bold text-white shadow-lg transition-all hover:bg-emerald-600"
                >
                  Campaign Manifesto
                </Link>

                <Link
                  href="/structure"
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                >
                  Campaign Structure
                </Link>
              </div>
            </div>

            {/* Candidate Side Image / Highlight Column */}
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
                    Campaign Operations & Intelligence
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
                          Field Operations & Tasks
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

      {/* =========================================================
          ABOUT POLITICORE SECTION
      ========================================================= */}
      <section className="bg-white dark:bg-gray-900 py-16 transition-colors duration-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Identity & Platform Capabilities
            </p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
              PolitiCore Operations Platform
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
              PolitiCore centralizes political organization, stakeholders, grassroots outreach, field operations, communications, events, and operational reporting.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-emerald-50/50 dark:bg-gray-800/60 p-6 shadow-sm">
              <div className="mb-4 inline-block rounded-lg bg-emerald-700 p-3 text-white">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Stakeholder Contact</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                Maintaining proactive, respectful relationships with traditional rulers, religious leaders, professional associations, civil-society groups, youth, and women organizations.
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-emerald-50/50 dark:bg-gray-800/60 p-6 shadow-sm">
              <div className="mb-4 inline-block rounded-lg bg-emerald-700 p-3 text-white">
                <Target className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Grassroots Outreach</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                Establishing direct contact with local communities across all wards and LGAs to effectively communicate organizational positions, initiatives, and programs.
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-emerald-50/50 dark:bg-gray-800/60 p-6 shadow-sm">
              <div className="mb-4 inline-block rounded-lg bg-emerald-700 p-3 text-white">
                <Heart className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Coordination & Feedback</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                Collecting genuine community feedback and concerns to relay to leadership while ensuring seamless, synchronized efforts across all organizational tiers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          CORE RESPONSIBILITIES
      ========================================================= */}
      <section className="bg-gray-100/70 dark:bg-gray-950 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
              Core Responsibilities
            </h2>
            <p className="mt-3 text-base text-gray-600 dark:text-gray-300">
              Our key pillars for relationship management and grassroots coordination
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Stakeholder Contact",
                desc: "Maintain relationship with community, religious, youth, women, and professional groups.",
              },
              {
                title: "Mobilization",
                desc: "Organize and coordinate members for meetings, consultations, rallies, and lawful activities.",
              },
              {
                title: "Grassroots Outreach",
                desc: "Communicate organizational programs directly to local structures and communities.",
              },
              {
                title: "Stakeholder Mapping",
                desc: "Identify important groups and individuals across wards, LGAs, and zones.",
              },
              {
                title: "Coordination",
                desc: "Synchronize activities across all organizational levels to avoid duplication of efforts.",
              },
              {
                title: "Feedback Mechanism",
                desc: "Collect community concerns and ideas and communicate them directly to leadership.",
              },
              {
                title: "Event Logistics",
                desc: "Coordinate invitations, protocol, liaison, and transportation for official events.",
              },
              {
                title: "Records & Reporting",
                desc: "Maintain accurate stakeholder contacts and produce structured outreach reports.",
              },
              {
                title: "Conflict Management",
                desc: "Help maintain constructive relationships and escalate disputes appropriately.",
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                    {idx + 1}
                  </div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">{item.title}</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed pl-10">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================
          ORGANIZATIONAL HIERARCHY
      ========================================================= */}
      <section className="bg-white dark:bg-gray-900 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Organizational Hierarchy
            </p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
              DCM Organizational Structure
            </h2>
            <p className="mt-3 text-gray-600 dark:text-gray-300">
              A structured network reaching every corner of Enugu State
            </p>
          </div>

          <div className="flex flex-col md:flex-row justify-center items-center gap-4 max-w-5xl mx-auto">
            {[
              { level: "State Executive", role: "State Oversight & Strategy" },
              { level: "Zonal Coordinators", role: "Senatorial Zone Alignment" },
              { level: "LGA Coordinators", role: "17 LGA Coordination" },
              { level: "Ward Coordinators", role: "Ward Level Engagement" },
              { level: "Community Teams", role: "Grassroots Unit Mobilization" },
            ].map((step, idx, arr) => (
              <div key={idx} className="flex flex-col md:flex-row items-center w-full md:w-auto">
                <div className="flex-1 min-w-[170px] rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-gray-800 p-4 text-center shadow-sm">
                  <span className="block text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400 mb-1">
                    Tier {idx + 1}
                  </span>
                  <h4 className="font-extrabold text-gray-900 dark:text-white text-sm">{step.level}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{step.role}</p>
                </div>
                {idx < arr.length - 1 && (
                  <div className="py-2 md:py-0 md:px-2 text-emerald-600 dark:text-emerald-400 font-bold">
                    <span className="md:hidden">↓</span>
                    <span className="hidden md:inline">→</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link
              href="/structure"
              className="inline-flex items-center text-sm font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800"
            >
              Explore Our Full Structure Members →
            </Link>
          </div>
        </div>
      </section>

      {/* =========================================================
          LATEST NEWS
      ========================================================= */}
      <section className="bg-gray-50 dark:bg-gray-950 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 flex items-center justify-between">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
              Latest News
            </h2>

            <Link
              href="/news"
              className="font-semibold text-emerald-700 dark:text-emerald-400 transition-colors hover:text-emerald-800"
            >
              View All →
            </Link>
          </div>

          {newsLoading ? (
            <div className="flex min-h-[200px] items-center justify-center gap-3 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-700" />
              <p className="text-sm font-medium">Loading updates...</p>
            </div>
          ) : latestNews.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center shadow-sm">
              <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                No published news articles yet.
              </p>
            </div>
          ) : (
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
                    <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
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

      {/* =========================================================
          CTA
      ========================================================= */}
      <section className="bg-gradient-to-br from-emerald-950 to-green-950 py-16 text-white max-w-full">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Mobilizing for Good Governance
          </h2>

          <p className="mb-8 text-lg text-emerald-100/90 max-w-2xl mx-auto">
            Get involved with DCM Enugu. Connect with community coordinators, stay updated on grassroots activities, and help build constructive stakeholder engagement across Enugu State.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/portal/dashboard"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-8 py-4 font-bold text-white transition-colors hover:bg-emerald-600 shadow-lg"
            >
              Access Operations Portal
            </Link>

            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-lg bg-white/10 px-8 py-4 font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              Contact Operations Center
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

