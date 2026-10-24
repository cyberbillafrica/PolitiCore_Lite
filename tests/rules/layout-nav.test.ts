import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_ADMIN_NAV_ENTRY,
  CAMPAIGN_NAV_ENTRIES,
  campaignNavItems,
  showCampaignGroup,
  type CampaignNavViewer,
} from "@/lib/campaign-nav";
import {
  ELECTION_NAV_ENTRIES,
  electionNavItems,
} from "@/lib/election-nav";

/*
 * ============================================================
 * SIDEBAR VISIBILITY — ROUND 8 FIX 1
 * ============================================================
 *
 * The portal sidebar is a React component and this project has no DOM
 * test harness, so the visibility DECISION lives in two pure modules
 * (`campaign-nav.ts` / `election-nav.ts`) and this file exercises
 * exactly what the sidebar renders from.
 *
 * The regression being guarded: a plain campaign member holds no
 * organizational assignment, and the old filter asked the permission
 * matrix — which answers from assignments — so only the dashboard
 * survived. A campaign member must see the whole campaign group.
 */

const PLAIN_MEMBER_PERMISSIONS = () => false;

/** No assignment, no permission — a plain campaign member. */
const plainMember: CampaignNavViewer = {
  isAdmin: false,
  isCampaignMember: true,
  isElectionOfficer: false,
};

const socialOnly: CampaignNavViewer = {
  isAdmin: false,
  isCampaignMember: false,
  isElectionOfficer: false,
};

const electionOfficer: CampaignNavViewer = {
  isAdmin: false,
  isCampaignMember: false,
  isElectionOfficer: true,
};

const admin: CampaignNavViewer = {
  isAdmin: true,
  isCampaignMember: true,
  isElectionOfficer: false,
};

const names = (entries: { name: string }[]): string[] =>
  entries.map((entry) => entry.name);

const CAMPAIGN_ITEM_NAMES = [
  "Campaign Dashboard",
  "My Area",
  "Members",
  "Assignments",
  "Activities",
  "Reports",
  "Issues",
];

describe("campaign navigation", () => {
  it("a plain campaign member sees all seven campaign sub-items", () => {
    expect(names(campaignNavItems(plainMember, PLAIN_MEMBER_PERMISSIONS))).toEqual(
      CAMPAIGN_ITEM_NAMES,
    );
  });

  it("a plain campaign member still sees them when the permission matrix says no", () => {
    /*
     * This is the bug: `hasPermission()` answers from organizational
     * assignments, and a plain member has none. The group must not
     * depend on that answer.
     */
    const visible = campaignNavItems(plainMember, PLAIN_MEMBER_PERMISSIONS);

    expect(visible).toHaveLength(7);
    expect(visible.map((entry) => entry.href)).toEqual([
      "/portal/dashboard",
      "/portal/campaign/area",
      "/portal/campaign/members",
      "/portal/campaign/assignments",
      "/portal/campaign/activities",
      "/portal/campaign/reports",
      "/portal/campaign/issues",
    ]);
  });

  it("a social-only member sees none of the campaign sub-items", () => {
    expect(showCampaignGroup(socialOnly)).toBe(false);
    expect(campaignNavItems(socialOnly, () => true)).toEqual([]);
  });

  it("an election officer sees none of the campaign sub-items", () => {
    expect(showCampaignGroup(electionOfficer)).toBe(false);
    expect(campaignNavItems(electionOfficer, () => true)).toEqual([]);
  });

  it("an election officer who is also a campaign member keeps the old permission-derived view", () => {
    /* Round 8 must not widen election-officer navigation. */
    expect(
      names(
        campaignNavItems(
          { ...electionOfficer, isCampaignMember: true },
          PLAIN_MEMBER_PERMISSIONS,
        ),
      ),
    ).toEqual(["Campaign Dashboard"]);
  });

  it("an admin sees all seven campaign sub-items", () => {
    expect(names(campaignNavItems(admin, PLAIN_MEMBER_PERMISSIONS))).toEqual(
      CAMPAIGN_ITEM_NAMES,
    );
  });

  it("an admin sees all seven plus Coordination, which members never see", () => {
    expect(CAMPAIGN_NAV_ENTRIES).toHaveLength(7);

    /* Coordination is the admin section's entry, not a campaign group item. */
    expect(CAMPAIGN_NAV_ENTRIES.map((entry) => entry.name)).not.toContain(
      "Coordination",
    );

    expect(
      names([
        ...campaignNavItems(admin, PLAIN_MEMBER_PERMISSIONS),
        CAMPAIGN_ADMIN_NAV_ENTRY,
      ]),
    ).toEqual([...CAMPAIGN_ITEM_NAMES, "Coordination"]);

    expect(
      campaignNavItems(plainMember, () => true).map((entry) => entry.name),
    ).not.toContain("Coordination");
  });
});

describe("election operations navigation", () => {
  const OFFICER_ITEMS = [
    "Election Dashboard",
    "Review Queue",
    "PU Reports",
    "Incidents",
    "Results",
    "Result Upload",
  ];

  it("is unchanged for an election officer: all six sub-items", () => {
    expect(
      names(
        electionNavItems({
          canViewElectionDashboard: true,
          canAccessElectionSurfaces: true,
        }),
      ),
    ).toEqual(OFFICER_ITEMS);
  });

  it("shows every sub-item to an admin", () => {
    expect(
      names(
        electionNavItems({
          canViewElectionDashboard: true,
          canAccessElectionSurfaces: true,
        }),
      ),
    ).toEqual(OFFICER_ITEMS);
  });

  it("still shows the reporting surfaces to a campaign member", () => {
    expect(
      names(
        electionNavItems({
          canViewElectionDashboard: false,
          canAccessElectionSurfaces: true,
        }),
      ),
    ).toEqual(["PU Reports", "Incidents", "Results", "Result Upload"]);
  });

  it("stays hidden for a social-only member", () => {
    expect(
      electionNavItems({
        canViewElectionDashboard: false,
        canAccessElectionSurfaces: false,
      }),
    ).toEqual([]);
  });

  it("keeps its original order and destinations", () => {
    expect(ELECTION_NAV_ENTRIES.map((entry) => entry.href)).toEqual([
      "/portal/election",
      "/portal/election/operations",
      "/portal/election/pu-reports",
      "/portal/election/incidents",
      "/portal/election/results",
      "/portal/election/upload",
    ]);
  });
});
