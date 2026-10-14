"use client";

import Link from "next/link";
import {
  BookOpen,
  Building2,
  CheckSquare,
  HelpCircle,
  Layers,
  Megaphone,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Vote,
} from "lucide-react";

import {
  HELP_ARTICLES,
  type HelpArticle,
} from "@/lib/help-content";

/*
 * ============================================================
 * USER GUIDE & OPERATIONS MANUAL
 * ============================================================
 *
 * The full guide, organised into the six sections members ask
 * about: Getting Started, Members, Campaign, Election, Admin and
 * Help. Every feature description is rendered from
 * src/lib/help-content.ts — the same content the floating help
 * panel shows — so the guide and the panel can never drift apart.
 *
 * The floating "?" button (bottom-right of every page) opens the
 * searchable panel; this page is the complete manual with a table
 * of contents.
 */

type GuideSectionId =
  | "getting-started"
  | "members"
  | "campaign"
  | "election"
  | "admin"
  | "help";

const SECTIONS: {
  id: GuideSectionId;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  blurb: string;
}[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: BookOpen,
    blurb: "What the portal is, how to join, and how to move around.",
  },
  {
    id: "members",
    title: "Members",
    icon: Users,
    blurb: "Membership types, your profile, notifications, tasks and the leaderboard.",
  },
  {
    id: "campaign",
    title: "Campaign",
    icon: CheckSquare,
    blurb: "Campaign Council: your area, members, assignments, activities, reports and issues.",
  },
  {
    id: "election",
    title: "Election",
    icon: Vote,
    blurb: "Cycles, contests, results, review, polling-unit reports and incidents.",
  },
  {
    id: "admin",
    title: "Admin",
    icon: Settings,
    blurb: "Managing members, content, settings, structure and the election engine.",
  },
  {
    id: "help",
    title: "Help",
    icon: HelpCircle,
    blurb: "How to get help, and answers to the most common problems.",
  },
];

const SECTION_ARTICLES: Record<GuideSectionId, string[]> = {
  "getting-started": [
    "what-is-the-portal",
    "signing-in-and-out",
    "registering-as-a-volunteer",
    "resetting-your-password",
    "understanding-the-dashboard",
    "navigation-and-menus",
  ],
  members: [
    "membership-types",
    "your-profile",
    "roles-explained",
    "organizational-scope",
    "notification-center-vs-popups",
    "social-tasks",
    "leaderboard",
  ],
  campaign: [
    "campaign-council-overview",
    "my-area",
    "member-directory",
    "assignments",
    "activities",
    "field-reports",
    "issues",
  ],
  election: [
    "election-concepts",
    "election-dashboard",
    "result-upload",
    "result-statuses",
    "officer-review",
    "result-corrections",
    "pu-reports",
    "election-incidents",
    "election-administration",
  ],
  admin: [
    "admin-overview",
    "manage-members",
    "coordination",
    "task-management",
    "public-content",
    "contact-messages",
    "campaign-analytics",
    "inec-officer-registration",
  ],
  help: [
    "access-denied",
    "why-no-election-menu",
    "why-cannot-perform-action",
    "why-not-another-ward",
    "result-status-changed",
    "cannot-edit-verified-result",
    "cannot-access-admin",
    "data-not-showing",
    "when-something-fails",
    "account-suspended",
  ],
};

function articlesFor(section: GuideSectionId): HelpArticle[] {
  return SECTION_ARTICLES[section]
    .map((id) => HELP_ARTICLES.find((article) => article.id === id))
    .filter((article): article is HelpArticle => Boolean(article));
}

export default function UserGuidePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 p-8 text-white shadow-xl sm:p-10">
        <div className="pointer-events-none absolute -right-8 -top-8 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10 max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide">
            <BookOpen className="h-4 w-4 text-emerald-200" /> PolitiCore
            Platform Manual
          </div>
          <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            System User Guide & Operations Manual
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-emerald-100/90 sm:text-base">
            The complete manual for PolitiCore (Political Operations & Campaign
            Intelligence Platform). Every section below describes what a feature
            does, who can use it, and how to use it. Stuck on a specific page?
            The <strong>?</strong> button at the bottom-right of every page
            opens help for exactly that page.
          </p>
        </div>
      </div>

      {/* Table of contents */}
      <nav
        aria-label="Table of contents"
        className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900"
      >
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Table of Contents
        </h2>

        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section, index) => {
            const Icon = section.icon;

            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex h-full flex-col gap-2 rounded-2xl border border-gray-200 p-4 transition-all hover:border-emerald-300 hover:shadow-sm dark:border-gray-800"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                    <span className="font-extrabold text-gray-900 dark:text-white">
                      {index + 1}. {section.title}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">{section.blurb}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Sections */}
      {SECTIONS.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="scroll-mt-6 space-y-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-xs sm:p-8 dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4 dark:border-gray-800">
            <section.icon className="h-7 w-7 text-emerald-700 dark:text-emerald-400" />
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {section.title}
              </h2>
              <p className="text-xs text-gray-500">{section.blurb}</p>
            </div>
          </div>

          {/* Feature articles */}
          <div className="space-y-4">
            {articlesFor(section.id).map((article) => (
              <article
                key={article.id}
                className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  {article.title}
                </h3>

                {article.body.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="text-xs leading-relaxed text-gray-600 dark:text-gray-300"
                  >
                    {paragraph}
                  </p>
                ))}

                {article.steps && article.steps.length > 0 && (
                  <ol className="list-decimal space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-300">
                    {article.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                )}

                {article.related && article.related.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {article.related.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>

          {/* Section-specific reference blocks (kept from the original manual) */}
          {section.id === "getting-started" && (
            <div className="grid gap-6 pt-2 md:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/50">
                <h3 className="text-sm font-extrabold text-emerald-800 dark:text-emerald-400">
                  Core Contact Functions
                </h3>
                <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                  PolitiCore focuses on identifying who to engage (community
                  leaders, professional groups, youth/women organizations) and
                  maintaining constructive long-term relationships across wards
                  and LGAs.
                </p>
              </div>

              <div className="space-y-2 rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/50">
                <h3 className="text-sm font-extrabold text-emerald-800 dark:text-emerald-400">
                  Core Mobilization Functions
                </h3>
                <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                  It organizes supporters and participants for lawful civic
                  meetings, conventions, and community outreach while preventing
                  duplicate effort across the campaign's organizational levels.
                </p>
              </div>
            </div>
          )}

          {section.id === "members" && (
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                <Sparkles className="h-4 w-4 text-emerald-600" /> Social Force
                specifics
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                    <CheckSquare className="h-4 w-4 text-emerald-600" />{" "}
                    Expanded action types
                  </h4>
                  <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                    Tasks support six interaction types: Like, Comment, Like and
                    Comment, Share, Comment and Share, and Make Post. For
                    content-generating actions (Share, Comment and Share, Make
                    Post), members submit a direct link to their post for
                    administrator verification.
                  </p>
                </div>

                <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />{" "}
                    Deadline enforcement & extensions
                  </h4>
                  <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                    Tasks automatically close at 23:59:59 WAT on their deadline
                    date. Expired tasks block new member submissions while
                    retaining historical submission records. Administrators can
                    extend deadlines at any time to re-open tasks.
                  </p>
                </div>

                <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                    <Users className="h-4 w-4 text-emerald-600" /> Relational
                    organizing & referrals
                  </h4>
                  <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                    Members receive a personal referral code and invite link.
                    When invited supporters sign up and complete their first
                    verified social task, the referring member earns bonus
                    points towards their leaderboard ranking.
                  </p>
                </div>

                <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                    <Settings className="h-4 w-4 text-emerald-600" />{" "}
                    Notifications & theme
                  </h4>
                  <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                    The Notification Bell in the header aggregates directorate
                    announcements with unread counters and “Mark all read”.
                    Actions raise clean confirmation toasts, and members can
                    switch between light and dark mode from the header.
                  </p>
                </div>
              </div>
            </div>
          )}

          {section.id === "admin" && (
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                <Settings className="h-4 w-4 text-emerald-600" /> Central
                Settings Control Center
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />{" "}
                    Maintenance mode controls
                  </h4>
                  <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                    Administrators can switch Maintenance Mode ON/OFF and choose
                    between two visitor experiences: a full-featured Maintenance
                    Page or a minimal Dark Blue Screen. Authorized
                    administrators are never locked out and retain full access
                    to the Admin → Settings page.
                  </p>
                </div>

                <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                    <Settings className="h-4 w-4 text-emerald-600" />{" "}
                    Customizing hero & header content
                  </h4>
                  <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                    Update headline text, sub-taglines, CTA button labels, logo
                    icons, header banners, and secretariat contact details
                    without requiring code redeployments.
                  </p>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                  <Layers className="h-4 w-4 text-emerald-600" />{" "}
                  Organizational structure management
                </h4>
                <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                  The Directorate operates under a clear 3-tier structure:
                  State Executive (high-level state officers and general
                  directorate coordinators), Zonal Coordinators (officers
                  covering the senatorial zones), and Local Government
                  Coordinators (LGA leadership managing local ward and community
                  mobilization teams).
                </p>
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                  Tip: Public visitors on the Structure page can click any
                  member card to open an interactive modal displaying contact
                  details, ward, position, and full-screen photo previews.
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                  <Megaphone className="h-4 w-4 text-emerald-600" />{" "}
                  Broadcasting & approvals
                </h4>
                <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                  News, Biography, Manifesto, Gallery and Broadcast
                  (announcements) are prepared as drafts and published to the
                  public site; announcements reach chosen audiences through
                  their Notification Center. News supports draft, published,
                  scheduled and archived states.
                </p>
              </div>
            </div>
          )}

          {section.id === "help" && (
            <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
              <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-200">
                <Building2 className="h-4 w-4" /> How the floating help works
              </h3>
              <p className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-200">
                Every page — public and portal — carries a small{" "}
                <strong>?</strong> button at the bottom-right. Clicking it
                opens the guidance panel with the articles that belong to the
                page you are on at the top, followed by role-aware starting
                points and the full, searchable article library. Screens across
                the portal also link into specific articles. If an article
                doesn&apos;t solve your problem, contact an administrator with
                what you were trying to do.
              </p>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
