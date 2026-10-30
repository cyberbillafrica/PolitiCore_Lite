import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  FileCheck,
  Newspaper,
  Palette,
  ShieldCheck,
  Smartphone,
  Users,
  Vote,
} from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { BRANDING } from "@/config/branding";

/*
 * ============================================================
 * /about — POLITICORE PRODUCT PAGE
 * ============================================================
 *
 * Public, unauthenticated marketing page. It describes the product,
 * not a candidate: every string comes from BRANDING (product name,
 * tagline, agency) or is product copy. The screenshots are the shared
 * product screenshots under public/screenshots/.
 *
 * The route stays /about. Candidate content lives on /biography and
 * /manifesto; this page does not read Firestore and does not gate on
 * auth, so it renders on an empty deployment.
 */

export const metadata: Metadata = {
  title: `${BRANDING.shortName} — ${BRANDING.tagline}`,
  description: `${BRANDING.shortName} is a campaign and election operations platform: coordinated field teams, auditable result uploads, live tallying, and content management in one workspace.`,
};

const features = [
  {
    icon: Users,
    title: "Campaign Coordination",
    description:
      "A multi-level hierarchy from state to zone, LGA, ward, and polling unit, with scoped assignments and per-person completion.",
  },
  {
    icon: Vote,
    title: "Election Operations",
    description:
      "Polling-unit result upload, an officer review queue, incident tracking, and a live situation room on election day.",
  },
  {
    icon: ShieldCheck,
    title: "Role-Based Access",
    description:
      "Admins, coordinators, and election officers each see exactly the surfaces and records their role allows.",
  },
  {
    icon: Bell,
    title: "Real-Time Notifications",
    description:
      "In-app alerts keep the team aligned as assignments move, reports arrive, and results are approved.",
  },
  {
    icon: FileCheck,
    title: "Immutable Audit Trail",
    description:
      "Every sensitive action is written to an append-only log, so decisions can be traced back to a person and a time.",
  },
  {
    icon: Smartphone,
    title: "Mobile-Ready",
    description:
      "Install the portal to a home screen and keep working in the field, with a branded offline fallback when the network drops.",
  },
  {
    icon: Newspaper,
    title: "Content Management",
    description:
      "News, biography, manifesto, events, and gallery publishing from one admin center, with images handled for you.",
  },
  {
    icon: Palette,
    title: "Brandable Per Client",
    description:
      "Product branding is environment-driven, and each deployment can upload its own logo and candidate palette.",
  },
];

const demoRows = [
  {
    src: "/screenshots/Dashboard.png",
    alt: "Campaign dashboard showing activity, tasks, and team performance",
    title: "Campaign dashboard",
    description:
      "One operational view for the whole campaign: activity volume, open assignments, field reports, and the health of every level in the hierarchy.",
  },
  {
    src: "/screenshots/Election-Upload.png",
    alt: "Election result upload form with polling unit and evidence capture",
    title: "Election result upload",
    description:
      "Officers and coordinators submit polling-unit results with evidence attached. Duplicate submissions are detected before they reach the tally.",
  },
  {
    src: "/screenshots/Result-Center.png",
    alt: "Live result center with running tally by ward and party",
    title: "Live result center",
    description:
      "Approved results roll up into a running tally by ward, LGA, and contest, with a review queue that keeps unverified numbers out of the total.",
  },
  {
    src: "/screenshots/Central-Settings.png",
    alt: "Central settings screen for branding, modules, and election configuration",
    title: "Central control settings",
    description:
      "Branding, modules, geography, terminology, and election dates are managed from one control center, with changes taking effect without a code edit.",
  },
];

/*
 * A static product screenshot in a light browser-chrome frame. The
 * frame is Tailwind only — no frame artwork, no external image.
 */
function BrowserFrame({
  src,
  alt,
  priority = false,
  className = "",
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl ${className}`}
    >
      <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-100 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 flex-1 truncate rounded-full bg-white px-3 py-1 text-[10px] font-medium text-gray-400">
          app.politicore.org
        </span>
      </div>

      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        className="block h-auto w-full"
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-apc-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-apc-primary">
      {children}
    </span>
  );
}

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      <main className="flex-1">
        {/* ============ 1. HERO ============ */}
        <section className="border-b border-gray-100 bg-gradient-to-b from-apc-light/70 via-white to-white">
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-20 lg:py-24 lg:px-8">
            <div>
              <SectionLabel>A product of {BRANDING.developerName}</SectionLabel>

              <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
                Run campaigns.
                <br />
                Win elections.
                <br />
                <span className="text-apc-primary">All in one platform.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg">
                {BRANDING.shortName} brings campaign coordination, election
                operations, and content management into a single role-aware
                workspace. Every assignment, report, and approved result stays
                in one auditable system your team can trust.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-apc-primary px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-apc-navy"
                >
                  Request a Demo
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-700 transition-colors hover:border-apc-primary hover:text-apc-primary"
                >
                  See Features
                </a>
              </div>

              <p className="mt-6 text-xs font-medium text-gray-500">
                Built for state, zonal, LGA, ward, and polling-unit teams.
              </p>
            </div>

            <BrowserFrame
              src="/screenshots/Dashboard.png"
              alt="PolitiCore campaign dashboard"
              priority
              className="lg:translate-y-2"
            />
          </div>
        </section>

        {/* ============ 2. FEATURES GRID ============ */}
        <section id="features" className="scroll-mt-24 bg-gray-50 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                Everything your campaign needs
              </h2>
              <p className="mt-4 text-base text-gray-600 sm:text-lg">
                One platform for coordination, elections, and content — built
                for real campaigns.
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-apc-primary/10">
                    <feature.icon className="h-5 w-5 text-apc-primary" />
                  </div>

                  <h3 className="mt-4 text-base font-bold text-gray-900">
                    {feature.title}
                  </h3>

                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ 3. PRODUCT DEMO ============ */}
        <section id="demo" className="scroll-mt-24 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <SectionLabel>Product tour</SectionLabel>

              <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                See it in action
              </h2>

              <p className="mt-4 text-base text-gray-600 sm:text-lg">
                A look inside the platform.
              </p>
            </div>

            <div className="mt-16 space-y-20">
              {demoRows.map((row, index) => (
                <div
                  key={row.src}
                  className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
                >
                  <div className={index % 2 === 1 ? "lg:order-2" : ""}>
                    <BrowserFrame src={row.src} alt={row.alt} />
                  </div>

                  <div className={index % 2 === 1 ? "lg:order-1" : ""}>
                    <h3 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
                      {row.title}
                    </h3>

                    <p className="mt-4 text-base leading-relaxed text-gray-600">
                      {row.description}
                    </p>
                  </div>
                </div>
              ))}

              {/* Content management uses two screenshots side by side. */}
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className="lg:order-2">
                  <h3 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
                    Content and profile management
                  </h3>

                  <p className="mt-4 text-base leading-relaxed text-gray-600">
                    Keep the candidate biography and the manifesto current from
                    the same admin center that publishes news and events. Draft,
                    review, publish, and unpublish without touching code.
                  </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:order-1">
                  <BrowserFrame
                    src="/screenshots/biography.png"
                    alt="Biography editor with portrait and profile details"
                  />
                  <BrowserFrame
                    src="/screenshots/manifesto.png"
                    alt="Manifesto editor with document upload and published text"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ 4. DEEP DIVE ============ */}
        <section className="bg-gray-50 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl space-y-24 px-4 sm:px-6 lg:px-8">
            {/* 4a. Election engine */}
            <div
              id="deep-dive-election"
              className="grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <BrowserFrame
                src="/screenshots/Election-Upload.png"
                alt="Polling-unit result upload with evidence capture"
              />

              <div>
                <SectionLabel>Election operations</SectionLabel>

                <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                  An election engine built for election day
                </h2>

                <ul className="mt-6 space-y-3">
                  {[
                    "Polling-unit result upload with evidence capture",
                    "Officer review queue with approve and reject decisions",
                    "Live tally and situation-room monitoring",
                    "Incident tracking with scope-based access",
                    "Duplicate-submission prevention before anything is counted",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm leading-relaxed text-gray-700 sm:text-base"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-apc-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 4b. Coordination */}
            <div
              id="deep-dive-coordination"
              className="grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <div className="lg:order-2">
                <BrowserFrame
                  src="/screenshots/Social.png"
                  alt="Team collaboration and audience engagement screen"
                />
              </div>

              <div className="lg:order-1">
                <SectionLabel>Campaign coordination</SectionLabel>

                <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                  Coordination at every level
                </h2>

                <ul className="mt-6 space-y-3">
                  {[
                    "State to zone, LGA, ward, and polling-unit hierarchy",
                    "Scoped assignments with per-person completion",
                    "Reports and issues routed by scope",
                    "Committee and structure management",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm leading-relaxed text-gray-700 sm:text-base"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-apc-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 4c. Administration */}
            <div
              id="deep-dive-admin"
              className="grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <BrowserFrame
                src="/screenshots/Central-Settings.png"
                alt="Central settings for roles, branding, and election cycles"
              />

              <div>
                <SectionLabel>Administration</SectionLabel>

                <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                  Roles, permissions, and accountability
                </h2>

                <ul className="mt-6 space-y-3">
                  {[
                    "Five coordinator levels plus election officers",
                    "Admin control center for cycles, contests, and parties",
                    "Append-only audit trail on every sensitive action",
                    "Member lifecycle management, including suspension",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm leading-relaxed text-gray-700 sm:text-base"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-apc-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ============ 5. FINAL CTA ============ */}
        <section className="bg-apc-primary py-20 text-white sm:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Ready to see it in action?
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-base text-white/80 sm:text-lg">
              Request a walkthrough and we will map the platform to your
              campaign structure, election calendar, and reporting needs.
            </p>

            <Link
              href="/contact"
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-7 py-3.5 text-sm font-bold text-apc-primary shadow-sm transition-colors hover:bg-apc-light"
            >
              Request a Demo
              <ArrowRight className="h-4 w-4" />
            </Link>

            <p className="mt-5 text-xs font-medium text-white/70">
              Built by {BRANDING.developerName}
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
