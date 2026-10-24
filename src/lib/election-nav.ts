/*
 * ============================================================
 * ELECTION OPERATIONS NAVIGATION — PURE POLICY
 * ============================================================
 *
 * Extracted verbatim from the portal layout so the navigation tests can
 * assert what an officer / admin / campaign member / social-only member
 * sees WITHOUT rendering React (the project has no DOM test harness).
 *
 * This module is DATA + the existing predicate only. The layout keeps
 * the icons, the accordion, the election-mode "Off" treatment and the
 * route links exactly as they were; the ordering and flags below are
 * the pre-Round-8 ones, unchanged.
 */

export interface ElectionNavEntry {
  name: string;
  href: string;

  adminOnly?: boolean;
  electionReporting?: boolean;
  electionModeRequired?: boolean;

  /*
   * The result review queue. Officers own it; admins may open it too
   * (read-only / correction-only — approval authority is the
   * officer's alone).
   */
  reviewQueue?: boolean;
}

export const ELECTION_NAV_ENTRIES: ElectionNavEntry[] = [
  {
    name: "Election Dashboard",
    href: "/portal/election",
    adminOnly: true,
    electionModeRequired: true,
  },
  {
    name: "Review Queue",
    href: "/portal/election/operations",
    reviewQueue: true,
    electionModeRequired: true,
  },
  {
    name: "PU Reports",
    href: "/portal/election/pu-reports",
    electionReporting: true,
    electionModeRequired: true,
  },
  {
    name: "Incidents",
    href: "/portal/election/incidents",
    electionReporting: true,
    electionModeRequired: true,
  },
  {
    name: "Results",
    href: "/portal/election/results",
    electionReporting: true,
  },
  {
    name: "Result Upload",
    href: "/portal/election/upload",
    electionReporting: true,
    electionModeRequired: true,
  },
];

export interface ElectionNavViewer {
  /** The central election dashboard and the review queue. */
  canViewElectionDashboard: boolean;
  /** Reporting / results surfaces (campaign members included). */
  canAccessElectionSurfaces: boolean;
}

/** The Election Operations sub-items this viewer sees, in order. */
export function electionNavItems(
  viewer: ElectionNavViewer,
): ElectionNavEntry[] {
  return ELECTION_NAV_ENTRIES.filter((entry) => {
    if (entry.reviewQueue) return viewer.canViewElectionDashboard;
    if (entry.adminOnly) return viewer.canViewElectionDashboard;
    if (entry.electionReporting) return viewer.canAccessElectionSurfaces;
    return false;
  });
}
