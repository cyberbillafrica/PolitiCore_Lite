"use client";

import { useState } from "react";
import {
  BookOpen,
  Settings,
  Vote,
  ShieldCheck,
  Megaphone,
  CheckSquare,
  Building2,
  Layers,
  Sparkles,
} from "lucide-react";

type GuideSection = "overview" | "admin" | "structure" | "inec" | "operations" | "theme";

export default function UserGuidePage() {
  const [activeSection, setActiveSection] = useState<GuideSection>("overview");

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 text-white rounded-3xl p-8 sm:p-10 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-bold tracking-wide uppercase mb-3">
            <BookOpen className="h-4 w-4 text-emerald-200" /> PolitiCore Platform Manual
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
            System User Guide & Operations Manual
          </h1>
          <p className="mt-2 text-sm sm:text-base text-emerald-100/90 leading-relaxed">
            Welcome to the comprehensive operational manual for PolitiCore (Political Operations & Campaign Intelligence Platform).
            Learn how to navigate organizational structures, manage field reports, control site settings, and process officer registrations.
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { id: "overview", label: "Overview & Purpose", icon: Building2 },
          { id: "admin", label: "Admin Control Center", icon: Settings },
          { id: "structure", label: "Organizational Structure", icon: Layers },
          { id: "inec", label: "INEC Officer Roster", icon: Vote },
          { id: "operations", label: "Field Operations & Tasks", icon: CheckSquare },
          { id: "theme", label: "Notifications & Themes", icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as GuideSection)}
              className={`p-4 rounded-2xl text-left border transition-all flex flex-col justify-between gap-3 ${
                isActive
                  ? "bg-emerald-700 text-white border-emerald-700 shadow-md scale-[1.02]"
                  : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300"
              }`}
            >
              <Icon className={`h-6 w-6 ${isActive ? "text-white" : "text-emerald-700 dark:text-emerald-400"}`} />
              <span className="text-xs font-extrabold leading-snug">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Guide Content Sections */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 shadow-xs">
        {activeSection === "overview" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
              <Building2 className="h-7 w-7 text-emerald-700 dark:text-emerald-400" />
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">PolitiCore Purpose & Architecture</h2>
                <p className="text-xs text-gray-500">PolitiCore — Political Operations & Campaign Platform</p>
              </div>
            </div>

            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              PolitiCore serves as the primary relationship-management, stakeholder-engagement, field outreach, campaign intelligence, and operational coordination platform across all organizational levels.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="p-5 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 space-y-2">
                <h3 className="font-extrabold text-sm text-emerald-800 dark:text-emerald-400">Core Contact Functions</h3>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  Focuses on identifying who to engage (community leaders, professional groups, youth/women organizations) and maintaining constructive long-term relationships across wards and LGAs.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 space-y-2">
                <h3 className="font-extrabold text-sm text-emerald-800 dark:text-emerald-400">Core Mobilization Functions</h3>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  Focuses on organizing supporters and participants for lawful civic meetings, conventions, and community outreach while preventing duplicate effort.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeSection === "admin" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
              <Settings className="h-7 w-7 text-emerald-700 dark:text-emerald-400" />
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Central Settings Control Center</h2>
                <p className="text-xs text-gray-500">Managing global website content, maintenance mode, branding, and hero section</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 space-y-2">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> Maintenance Mode Controls
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  Administrators can switch Maintenance Mode ON/OFF and choose between two visitor experiences: a full-featured <strong>Maintenance Page</strong> or a minimal <strong>Dark Blue Screen</strong>.
                  Authorized administrators are never locked out and retain full access to `/portal/admin/settings`.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 space-y-2">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  <Settings className="h-4 w-4 text-emerald-600" /> Customizing Hero & Header Content
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  Update headline text, sub-taglines, CTA button labels, logo icons, header banners, and secretariat contact details without requiring code redeployments.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeSection === "structure" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
              <Layers className="h-7 w-7 text-emerald-700 dark:text-emerald-400" />
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Organizational Structure Management</h2>
                <p className="text-xs text-gray-500">State, Zonal, and LGA Leadership Tiers</p>
              </div>
            </div>

            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              The Directorate operates under a clear 3-tier structure:
            </p>

            <ul className="list-disc list-inside text-xs text-gray-600 dark:text-gray-300 space-y-2 pl-2">
              <li><strong>State Executive:</strong> High-level state officers and general directorate coordinators.</li>
              <li><strong>Zonal Coordinators:</strong> Officers covering Enugu East, Enugu West, and Enugu North zones.</li>
              <li><strong>Local Government Coordinators:</strong> LGA leadership managing local ward and community mobilization teams.</li>
            </ul>

            <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
              <p className="text-xs text-emerald-800 dark:text-emerald-200 font-medium">
                Tip: Public visitors on <code>/structure</code> can click any member card to open an interactive modal displaying contact details, ward, position, and full-screen face image previews.
              </p>
            </div>
          </div>
        )}

        {activeSection === "inec" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
              <Vote className="h-7 w-7 text-emerald-700 dark:text-emerald-400" />
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">INEC Officer Registration & Management</h2>
                <p className="text-xs text-gray-500">Public candidate applications and admin roster controls</p>
              </div>
            </div>

            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              Public candidates apply via <code>/register-inec-officer</code>. The form captures full names, NIN, phone, address, LGA, ward, position applied (SPO, PO, APO), educational qualifications, and bank account details.
            </p>

            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 space-y-2">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">Admin Roster Features</h3>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                Admins at <code>/portal/admin/inec-officers</code> can search applicants, filter by LGA and Position, inspect applicant credentials in a detail popup, export CSV files, and generate official printable PDF reports.
              </p>
            </div>
          </div>
        )}

        {activeSection === "operations" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
              <CheckSquare className="h-7 w-7 text-emerald-700 dark:text-emerald-400" />
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Field Operations & Member Portal</h2>
                <p className="text-xs text-gray-500">Tasks, reports, coordination, and election monitoring</p>
              </div>
            </div>

            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              Portal members can view assigned tasks, submit field activity reports, monitor ward electoral coverage, and access election incident loggers during active polling exercises.
            </p>
          </div>
        )}

        {activeSection === "theme" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
              <Sparkles className="h-7 w-7 text-emerald-700 dark:text-emerald-400" />
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Notifications & Theme Preferences</h2>
                <p className="text-xs text-gray-500">Central Bell System, Toast Alerts, and Dark Mode</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 space-y-2">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-emerald-600" /> Notification Bell System
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  Located on the top header bar, the Notification Bell aggregates all directorate announcements and broadcasts with unread counters and &quot;Mark all read&quot; capabilities.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 space-y-2">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">In-App Toast Alerts & Theme Switcher</h3>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  Actions perform clean pop-up toasts for instant confirmation. Members can switch between Basic Light Mode and Basic Dark Mode anytime from the top header or Admin Control Center.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
