"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  CheckSquare,
  TrendingUp,
  Vote,
  FileText,
  AlertTriangle,
  Upload,
  Menu,
  X,
  ChevronDown,
  Newspaper,
  Megaphone,
  BarChart3,
  Settings,
  LogOut,
  MapPin,
  Map,
  BriefcaseBusiness,
  CalendarDays,
  Network,
  Image,
  BookOpen,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { logOut } from "@/lib/firebase/auth";
import {
  CAMPAIGN_ADMIN_NAV_ENTRY,
  CAMPAIGN_NAV_ENTRIES,
  campaignNavItems,
  showCampaignGroup,
  type CampaignNavEntry,
} from "@/lib/campaign-nav";
import {
  ELECTION_NAV_ENTRIES,
  electionNavItems,
  type ElectionNavEntry,
} from "@/lib/election-nav";
import { useElectionMode } from "@/hooks/useElectionEngine";
import { useElectoralLookup } from "@/hooks/useElectoralLookup";

import type { Permission, UserProfile, Ward, PollingUnit } from "@/types";

type NavLeaf = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;

  socialOnly?: boolean;
  campaignOnly?: boolean;

  permission?: Permission;
  adminOnly?: boolean;
};

type NavChild = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;

  adminOnly?: boolean;
  electionReporting?: boolean;
  electionModeRequired?: boolean;

  /*
   * The result review queue. Officers own it; admins may open it too
   * (read-only / correction-only — approval authority is the
   * officer's alone).
   */
  reviewQueue?: boolean;
};

type NavGroup = {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "campaign" | "election";
  children: NavLeaf[];
};

type ElectionGroup = {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "election";
  children: NavChild[];
};

type NavItem = NavLeaf | NavGroup | ElectionGroup;

type ElectoralLocation = {
  ward: Ward | null;
  pollingUnit: PollingUnit | null;
  lgaName?: string | null;
};

/*
 * One icon per campaign destination. The label / href / permission data
 * lives in `campaign-nav.ts`, which the navigation tests exercise.
 */
const CAMPAIGN_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  "/portal/dashboard": LayoutDashboard,
  "/portal/campaign/area": Network,
  "/portal/campaign/members": Users,
  "/portal/campaign/assignments": CheckSquare,
  "/portal/campaign/activities": CalendarDays,
  "/portal/campaign/reports": FileText,
  "/portal/campaign/issues": AlertTriangle,
};

function campaignNavLeaf(entry: CampaignNavEntry): NavLeaf {
  return {
    ...entry,
    icon: CAMPAIGN_ICONS[entry.href] ?? LayoutDashboard,
  };
}

const ELECTION_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  "/portal/election": LayoutDashboard,
  "/portal/election/operations": CheckSquare,
  "/portal/election/pu-reports": FileText,
  "/portal/election/incidents": AlertTriangle,
  "/portal/election/results": BarChart3,
  "/portal/election/upload": Upload,
};

function electionNavLeaf(entry: ElectionNavEntry): NavLeaf {
  return {
    ...entry,
    icon: ELECTION_ICONS[entry.href] ?? Vote,
  };
}

const navigation: NavItem[] = [
  {
    name: "Dashboard",
    href: "/portal/dashboard",
    icon: LayoutDashboard,
  },

  {
    name: "Profile",
    href: "/portal/profile",
    icon: Users,
  },

  {
    name: "User Guide & Manual",
    href: "/portal/guide",
    icon: BookOpen,
  },

  {
    name: "Tasks",
    href: "/portal/tasks",
    icon: CheckSquare,
    socialOnly: true,
  },

  {
    name: "Leaderboard",
    href: "/portal/leaderboard",
    icon: TrendingUp,
    socialOnly: true,
  },

  {
    name: "Campaign Structure",
    icon: BriefcaseBusiness,
    group: "campaign",

    children: CAMPAIGN_NAV_ENTRIES.map(campaignNavLeaf),
  },

  {
    name: "Election Operations",
    icon: Vote,
    group: "election",
    children: ELECTION_NAV_ENTRIES.map(electionNavLeaf),
  },
];

const adminNavigation = [
  {
    name: "Admin Dashboard",
    href: "/portal/admin",
    icon: LayoutDashboard,
  },

  {
    name: "Social Analytics",
    href: "/portal/admin/analytics",
    icon: BarChart3,
  },

  {
    name: "Biography",
    href: "/portal/admin/biography",
    icon: Users,
  },

  {
    name: "Manifesto",
    href: "/portal/admin/manifesto",
    icon: FileText,
  },

  {
    name: "Council Structure",
    href: "/portal/admin/structure",
    icon: UsersRound,
  },

  {
    name: "Members",
    href: "/portal/admin/members",
    icon: Users,
  },

  {
    name: "Tasks",
    href: "/portal/tasks",
    icon: CheckSquare,
  },

  {
    name: "News",
    href: "/portal/admin/news",
    icon: Newspaper,
  },

  {
    name: "Gallery",
    href: "/portal/admin/gallery",
    icon: Image,
  },

  {
    name: "Broadcast",
    href: "/portal/admin/announcements",
    icon: Megaphone,
  },

  {
    name: "Reports",
    href: "/portal/admin/reports",
    icon: BarChart3,
  },

  {
    ...CAMPAIGN_ADMIN_NAV_ENTRY,
    icon: UsersRound,
  },

  {
    name: "Election Control Center",
    href: "/portal/admin/election",
    icon: Vote,
  },

  {
    name: "Election Audit Log",
    href: "/portal/admin/audit",
    icon: FileText,
  },

  {
    name: "Settings",
    href: "/portal/admin/settings",
    icon: Settings,
  },
];

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const { user, profile, loading, hasPermission, isCampaignMember } = useAuth();

  const role = profile?.access_role ?? null;

  const isAdmin = role === "admin";

  const isElectionOfficer = role === "election_officer";

  const isSocialMember =
    profile?.membership_types?.includes("social_member") ?? false;

  const canAccessElectionSurfaces =
    role === "election_officer" || role === "admin" || isCampaignMember;

  /*
   * The central election dashboard and the result review queue are
   * admin + election-officer surfaces. Officers were previously
   * blocked here entirely.
   */
  const canViewElectionDashboard = isAdmin || isElectionOfficer;

  /*
   * Master election switch, read live from the single
   * `election_settings` document. When OFF the election navigation is
   * greyed out and route-disabled below; the same flag is enforced
   * server-side by `electionModeEnabled()` in firestore.rules.
   */
  const { electionMode } = useElectionMode();

  const [campaignOpen, setCampaignOpen] = useState(() =>
    pathname.startsWith("/portal/campaign"),
  );

  const [electionOpen, setElectionOpen] = useState(() =>
    pathname.startsWith("/portal/election"),
  );

  const [adminOpen, setAdminOpen] = useState(() =>
    pathname.startsWith("/portal/admin"),
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setCampaignOpen(pathname.startsWith("/portal/campaign"));
    setElectionOpen(pathname.startsWith("/portal/election"));
    setAdminOpen(pathname.startsWith("/portal/admin"));
    setSidebarOpen(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pathname]);

  /*
   * The signed-in member's registered electoral area, resolved
   * from the LIVE state-wide dataset (the bundled single-LGA
   * fallback used to leave every other LGA blank).
   */
  const lookup = useElectoralLookup();

  const registeredWard = lookup.wardById(profile?.ward_id);

  const registeredPollingUnit = lookup.pollingUnitById(
    profile?.ward_id,
    profile?.polling_unit_id,
  );

  const electoralLocation: ElectoralLocation | null =
    registeredWard || registeredPollingUnit
      ? {
          ward: registeredWard,
          pollingUnit: registeredPollingUnit,
          lgaName: profile
            ? lookup.lgaLabel(profile.lga_id, profile.ward_id)
            : null,
        }
      : null;

  const handleLogout = async () => {
    if (loggingOut) return;

    setLogoutError(null);
    setLoggingOut(true);

    const { error } = await logOut();

    if (error) {
      console.error("Logout failed:", error);

      setLogoutError("Unable to sign out. Please try again.");

      setLoggingOut(false);

      return;
    }

    router.replace("/login");
  };

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-apc-primary/20 border-t-apc-primary" />

          <p className="text-sm text-gray-500">
            {loading ? "Loading your portal..." : "Redirecting to login..."}
          </p>
        </div>
      </div>
    );
  }

  const showCampaignCouncil = isCampaignMember || isAdmin;

  /*
   * R8 — the campaign group's visibility policy. Deliberately NOT the
   * permission matrix: a plain campaign member holds no organizational
   * assignment, yet every campaign page is theirs to open.
   */
  const campaignViewer = {
    isAdmin,
    isCampaignMember,
    isElectionOfficer,
  };

  const renderNav = () => (
    <>
      {navigation.map((item) => {
        if ("group" in item && item.group === "campaign") {
          if (!showCampaignGroup(campaignViewer)) {
            return null;
          }

          const visibleChildren = campaignNavItems(
            campaignViewer,
            hasPermission,
          ).map(campaignNavLeaf);

          if (visibleChildren.length === 0) {
            return null;
          }

          return (
            <div key={item.name} className="mt-2">
              <button
                type="button"
                onClick={() => setCampaignOpen((open) => !open)}
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",

                  pathname.startsWith("/portal/campaign")
                    ? "bg-apc-primary/10 text-apc-primary"
                    : "text-gray-700 hover:bg-gray-100",
                )}
              >
                <item.icon className="mr-3 h-5 w-5" />

                <span>{item.name}</span>

                <ChevronDown
                  className={cn(
                    "ml-auto h-4 w-4 transition-transform",
                    campaignOpen && "rotate-180",
                  )}
                />
              </button>

              {campaignOpen && (
                <div className="ml-4 mt-1 space-y-1 border-l border-gray-200 pl-2">
                  {visibleChildren.map((child) => {
                    const active =
                      pathname === child.href ||
                      pathname.startsWith(`${child.href}/`);

                    const isCampaignDashboard =
                      child.href === "/portal/dashboard";

                    const dashboardActive =
                      isCampaignDashboard && pathname === "/portal/dashboard";

                    const finalActive = isCampaignDashboard
                      ? dashboardActive
                      : active;

                    return (
                      <Link
                        key={child.name}
                        href={child.href}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          "flex items-center rounded-lg px-3 py-2 text-sm transition-colors",

                          finalActive
                            ? "bg-apc-primary/10 font-medium text-apc-primary"
                            : "text-gray-600 hover:bg-gray-50",
                        )}
                      >
                        <child.icon className="mr-3 h-4 w-4 shrink-0" />

                        {child.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        if ("group" in item && item.group === "election") {
          const visibleChildren = electionNavItems({
            canViewElectionDashboard,
            canAccessElectionSurfaces,
          }).map(electionNavLeaf);

          if (visibleChildren.length === 0) {
            return null;
          }

          return (
            <div key={item.name} className="mt-2">
              <button
                type="button"
                onClick={() => setElectionOpen((open) => !open)}
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",

                  pathname.startsWith("/portal/election")
                    ? "bg-apc-primary/10 text-apc-primary"
                    : "text-gray-700 hover:bg-gray-100",
                )}
              >
                <item.icon className="mr-3 h-5 w-5" />

                <span>{item.name}</span>

                {!electionMode && (
                  <span className="ml-auto mr-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Off
                  </span>
                )}

                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    electionOpen && "rotate-180",
                    !electionMode && "text-gray-400",
                  )}
                />
              </button>

              {electionOpen && (
                <div className="ml-4 mt-1 space-y-1 border-l border-gray-200 pl-2">
                  {visibleChildren.map((child) => {
                    const disabled =
                      "electionModeRequired" in child &&
                      child.electionModeRequired &&
                      !electionMode;

                    const active =
                      pathname === child.href ||
                      pathname.startsWith(`${child.href}/`);

                    if (disabled) {
                      return (
                        <div
                          key={child.name}
                          aria-disabled="true"
                          title="Election Mode is currently off"
                          className="flex cursor-not-allowed select-none items-center rounded-lg px-3 py-2 text-sm text-gray-400"
                        >
                          <child.icon className="mr-3 h-4 w-4 shrink-0" />

                          <span>{child.name}</span>

                          <span className="ml-auto text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                            Off
                          </span>
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={child.name}
                        href={child.href}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          "flex items-center rounded-lg px-3 py-2 text-sm transition-colors",

                          active
                            ? "bg-apc-primary/10 font-medium text-apc-primary"
                            : "text-gray-600 hover:bg-gray-50",
                        )}
                      >
                        <child.icon className="mr-3 h-4 w-4" />

                        {child.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        if ("socialOnly" in item && item.socialOnly && !isSocialMember) {
          return null;
        }

        if (
          "campaignOnly" in item &&
          item.campaignOnly &&
          !showCampaignCouncil
        ) {
          return null;
        }

        if ("children" in item) {
          return null;
        }

        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={cn(
              "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",

              active
                ? "bg-apc-primary/10 text-apc-primary"
                : "text-gray-700 hover:bg-gray-100",
            )}
          >
            <item.icon className="mr-3 h-5 w-5" />

            {item.name}
          </Link>
        );
      })}

      {isAdmin && (
        <div className="mt-4 border-t pt-4">
          <button
            type="button"
            onClick={() => setAdminOpen((open) => !open)}
            className={cn(
              "flex w-full items-center rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",

              pathname.startsWith("/portal/admin")
                ? "bg-apc-primary/5 text-apc-primary"
                : "text-gray-400 hover:bg-gray-50 hover:text-gray-600",
            )}
          >
            <span>Administration</span>

            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 transition-transform",
                adminOpen && "rotate-180",
              )}
            />
          </button>

          {adminOpen && (
            <div className="mt-2 space-y-1">
              {adminNavigation.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",

                      active
                        ? "bg-apc-primary/10 text-apc-primary"
                        : "text-gray-700 hover:bg-gray-100",
                    )}
                  >
                    <item.icon className="mr-3 h-5 w-5" />

                    {item.name}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );

  const userName =
    profile?.full_name || user?.displayName || user?.email || "Portal Member";

  const membershipLabels: string[] = [];

  if (isSocialMember) {
    membershipLabels.push("Social Member");
  }

  if (showCampaignCouncil) {
    membershipLabels.push("Campaign Member");
  }

  const membershipLabel =
    membershipLabels.length > 0 ? membershipLabels.join(" • ") : "Member";

  const roleLabel = isAdmin
    ? "Administrator"
    : isElectionOfficer
      ? "Election Officer"
      : membershipLabel;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Sidebar */}

      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          sidebarOpen ? "block" : "hidden",
        )}
      >
        <div
          className="fixed inset-0 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />

        <div className="fixed inset-y-0 left-0 flex w-72 flex-col overflow-hidden bg-white shadow-xl">
          <div className="flex h-16 shrink-0 items-center justify-between border-b px-6">
            <Link
              href="/"
              className="flex items-center space-x-2"
              onClick={() => setSidebarOpen(false)}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-white font-extrabold text-sm">
                PC
              </div>

              <span className="text-lg font-bold text-emerald-800">
                POLITICORE
              </span>
            </Link>

            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-2 hover:bg-gray-100"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-4">
            {renderNav()}
          </nav>

          <div className="shrink-0 border-t bg-white p-4">
            <UserPanel
              userName={userName}
              roleLabel={roleLabel}
              profile={profile}
              electoralLocation={electoralLocation}
              onLogout={handleLogout}
              loggingOut={loggingOut}
              logoutError={logoutError}
            />
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}

      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col">
        <div className="flex h-full min-h-0 flex-col overflow-hidden border-r bg-white">
          <div className="flex h-16 shrink-0 items-center border-b px-6">
            <Link href="/" className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-white font-extrabold text-sm">
                PC
              </div>

              <span className="text-lg font-bold text-emerald-800">
                POLITICORE
              </span>
            </Link>
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-4">
            {renderNav()}
          </nav>

          <div className="shrink-0 border-t bg-white p-4">
            <UserPanel
              userName={userName}
              roleLabel={roleLabel}
              profile={profile}
              electoralLocation={electoralLocation}
              onLogout={handleLogout}
              loggingOut={loggingOut}
              logoutError={logoutError}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}

      <div className="lg:pl-72 pb-20 lg:pb-8">
        {/* Top Desktop & Mobile Header Bar with Bell Notification System */}
        <header className="sticky top-0 z-40 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 sm:px-6 h-16 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-6 w-6" />
            </button>

            <Link href="/" className="flex items-center space-x-2 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-white font-extrabold text-sm">
                PC
              </div>
              <span className="font-bold text-emerald-800 dark:text-emerald-400">
                POLITICORE
              </span>
            </Link>

            <h2 className="hidden lg:block text-sm font-extrabold text-gray-800 dark:text-gray-200 uppercase tracking-wider">
              PolitiCore Operations Portal
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Central Notification Bell Drawer */}
            <NotificationBell profile={profile} />
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* Mobile Bottom Navigation Bar (< lg) */}
      <nav className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 pb-[env(safe-area-inset-bottom)] shadow-lg">
        <div className="grid grid-cols-5 h-16 items-center">
          <Link
            href="/portal/dashboard"
            className={cn(
              "flex flex-col items-center justify-center h-full text-[10px] font-bold transition-colors min-h-[44px]",
              pathname === "/portal/dashboard"
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200",
            )}
          >
            <LayoutDashboard className="h-5 w-5 mb-0.5" />
            <span>Dashboard</span>
          </Link>

          {(isSocialMember || isAdmin) && (
            <Link
              href="/portal/tasks"
              className={cn(
                "flex flex-col items-center justify-center h-full text-[10px] font-bold transition-colors min-h-[44px]",
                pathname === "/portal/tasks"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200",
              )}
            >
              <CheckSquare className="h-5 w-5 mb-0.5" />
              <span>Tasks</span>
            </Link>
          )}

          {(isSocialMember || isAdmin) && (
            <Link
              href="/portal/leaderboard"
              className={cn(
                "flex flex-col items-center justify-center h-full text-[10px] font-bold transition-colors min-h-[44px]",
                pathname === "/portal/leaderboard"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200",
              )}
            >
              <TrendingUp className="h-5 w-5 mb-0.5" />
              <span>Leaderboard</span>
            </Link>
          )}

          {isAdmin ? (
            <Link
              href="/portal/admin/analytics"
              className={cn(
                "flex flex-col items-center justify-center h-full text-[10px] font-bold transition-colors min-h-[44px]",
                pathname === "/portal/admin/analytics"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200",
              )}
            >
              <BarChart3 className="h-5 w-5 mb-0.5" />
              <span>Analytics</span>
            </Link>
          ) : (
            <Link
              href="/portal/profile"
              className={cn(
                "flex flex-col items-center justify-center h-full text-[10px] font-bold transition-colors min-h-[44px]",
                pathname === "/portal/profile"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200",
              )}
            >
              <Users className="h-5 w-5 mb-0.5" />
              <span>Profile</span>
            </Link>
          )}

          <Link
            href="/portal/guide"
            className={cn(
              "flex flex-col items-center justify-center h-full text-[10px] font-bold transition-colors min-h-[44px]",
              pathname === "/portal/guide"
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200",
            )}
          >
            <BookOpen className="h-5 w-5 mb-0.5" />
            <span>Guide</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}

function UserPanel({
  userName,
  roleLabel,
  electoralLocation,
  onLogout,
  loggingOut,
  logoutError,
}: {
  userName: string;
  roleLabel: string;
  profile: UserProfile | null;
  electoralLocation: ElectoralLocation | null;
  onLogout: () => void;
  loggingOut: boolean;
  logoutError: string | null;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-apc-primary">
          <span className="text-sm font-semibold text-white">
            {userName.charAt(0).toUpperCase()}
          </span>
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {userName}
          </p>

          <p className="text-xs text-gray-500">{roleLabel}</p>
        </div>
      </div>

      {electoralLocation &&
        (electoralLocation.ward || electoralLocation.pollingUnit) && (
          <div className="mb-3 space-y-2 rounded-lg bg-gray-50 p-3">
            {electoralLocation.lgaName && (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-apc-primary" />

                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    LGA
                  </p>

                  <p className="truncate text-xs font-medium text-gray-700">
                    {electoralLocation.lgaName}
                  </p>
                </div>
              </div>
            )}

            {electoralLocation.ward && (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-apc-primary" />

                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Ward
                  </p>

                  <p className="truncate text-xs font-medium text-gray-700">
                    {electoralLocation.ward.name}
                  </p>
                </div>
              </div>
            )}

            {electoralLocation.pollingUnit && (
              <div className="flex items-start gap-2">
                <Map className="mt-0.5 h-4 w-4 shrink-0 text-apc-primary" />

                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Polling Unit
                  </p>

                  <p className="truncate text-xs font-medium text-gray-700">
                    {electoralLocation.pollingUnit.name}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

      {logoutError && (
        <p className="mb-2 text-xs text-red-600" role="alert">
          {logoutError}
        </p>
      )}

      <button
        type="button"
        onClick={onLogout}
        disabled={loggingOut}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" />

        {loggingOut ? "Signing out..." : "Sign Out"}
      </button>
    </div>
  );
}
