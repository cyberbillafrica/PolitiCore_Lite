/*
 * ============================================================
 * CAMPAIGN NAVIGATION — PURE POLICY
 * ============================================================
 *
 * The sidebar used to decide campaign visibility from the permission
 * matrix alone. A plain campaign member has no ORGANIZATIONAL
 * assignment, and `positionHasPermission()` answers from assignments, so
 * every sub-item except the dashboard (which bypassed the check) fell
 * out of the group — even though the same member can open every one of
 * those pages from a dashboard card, and the baseline projection gives
 * them the grants the pages need.
 *
 * The rule is therefore membership-based: a campaign member sees the
 * campaign pages, whatever position (if any) they hold. Election
 * officers keep exactly the visibility they had before Round 8 (their
 * campaign view stays permission-derived), and a social-only member
 * sees no campaign sub-items at all.
 *
 * Pure, React-free and Firebase-free so `tests/rules/layout-nav.test.ts`
 * exercises the same function the sidebar renders from.
 */

import type { Permission } from "@/types";

export interface CampaignNavEntry {
  name: string;
  href: string;
  permission?: Permission;
}

/**
 * The campaign sub-items, in sidebar order, as DATA. The layout attaches
 * the icons; the policy below decides visibility.
 */
export const CAMPAIGN_NAV_ENTRIES: CampaignNavEntry[] = [
  {
    name: "Campaign Dashboard",
    href: "/portal/dashboard",
  },
  {
    name: "My Area",
    href: "/portal/campaign/area",
    permission: "view_area",
  },
  {
    name: "Members",
    href: "/portal/campaign/members",
    permission: "view_members",
  },
  {
    name: "Assignments",
    href: "/portal/campaign/assignments",
    permission: "view_assignments",
  },
  {
    name: "Activities",
    href: "/portal/campaign/activities",
    permission: "view_activities",
  },
  {
    name: "Reports",
    href: "/portal/campaign/reports",
    permission: "submit_field_report",
  },
  {
    name: "Issues",
    href: "/portal/campaign/issues",
    permission: "report_issue",
  },
];

/**
 * The one campaign page that is admin-only. It lives in the Admin
 * section of the sidebar, never in the Campaign group, so a plain
 * campaign member does not see it.
 */
export const CAMPAIGN_ADMIN_NAV_ENTRY = {
  name: "Coordination",
  href: "/portal/campaign/coordination",
} as const;

export interface CampaignNavViewer {
  isAdmin: boolean;
  isCampaignMember: boolean;
  isElectionOfficer: boolean;
}

/**
 * Whether the Campaign group is rendered at all. Election officers who
 * are not campaign members have no campaign surfaces; an admin and any
 * campaign member do.
 */
export function showCampaignGroup(viewer: CampaignNavViewer): boolean {
  return viewer.isAdmin || viewer.isCampaignMember;
}

/**
 * The campaign sub-items this viewer sees, in sidebar order.
 *
 *   admin ................ every item
 *   campaign member ...... every item (no position required)
 *   election officer ..... unchanged: permission-derived (the dashboard
 *                          is always shown, exactly as before)
 *   anyone else .......... none
 */
export function campaignNavItems(
  viewer: CampaignNavViewer,
  hasPermission: (permission: Permission) => boolean,
): CampaignNavEntry[] {
  if (!showCampaignGroup(viewer)) return [];

  if (viewer.isAdmin) return CAMPAIGN_NAV_ENTRIES;

  /*
   * A campaign member who is ALSO an election officer keeps the
   * officer's narrower, permission-derived campaign view so R8 does not
   * change election-officer navigation.
   */
  if (viewer.isCampaignMember && !viewer.isElectionOfficer) {
    return CAMPAIGN_NAV_ENTRIES;
  }

  return CAMPAIGN_NAV_ENTRIES.filter(
    (entry) => !entry.permission || hasPermission(entry.permission),
  );
}
