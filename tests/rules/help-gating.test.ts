import { describe, expect, it } from "vitest";

import {
  GUIDE_SECTION_ARTICLES,
  GUIDE_SECTIONS,
  HELP_ARTICLES,
  HELP_ROUTE_MAP,
  filterHelpArticles,
  guideSectionsFor,
  helpArticlesForRoute,
  helpRolesFor,
  helpVisibleTo,
  type HelpViewer,
} from "@/lib/help-content";

/*
 * ============================================================
 * HELP VISIBILITY — ROUND 13
 * ============================================================
 *
 * The regression being guarded: `roles` existed on every article but
 * nothing ever read it, so an anonymous visitor — the floating panel
 * also mounts on public pages — could open the administrator
 * library. The gate lives in help-content.ts as pure functions and
 * this file exercises the whole matrix without a DOM or Firestore.
 */

const anonymous: HelpViewer | null = null;

const socialMember: HelpViewer = {
  access_role: "member",
  membership_types: ["social_member"],
};

const campaignMember: HelpViewer = {
  access_role: "member",
  membership_types: ["campaign_member"],
};

const dualMember: HelpViewer = {
  access_role: "member",
  membership_types: ["campaign_member", "social_member"],
};

const electionOfficer: HelpViewer = {
  access_role: "election_officer",
  membership_types: [],
};

const campaignOfficer: HelpViewer = {
  access_role: "election_officer",
  membership_types: ["campaign_member"],
};

const admin: HelpViewer = {
  access_role: "admin",
  membership_types: [],
};

const ids = (articles: { id: string }[]): string[] =>
  articles.map((article) => article.id);

const ADMIN_ONLY_IDS = HELP_ARTICLES.filter(
  (article) => article.roles.length === 1 && article.roles[0] === "admin",
).map((article) => article.id);

describe("help role expansion", () => {
  it("gives an anonymous visitor only the public role", () => {
    expect([...helpRolesFor(anonymous)]).toEqual(["all"]);
  });

  it("gives an administrator every help role", () => {
    expect([...helpRolesFor(admin)].sort()).toEqual(
      ["admin", "all", "campaign_member", "election_officer", "social_member"].sort(),
    );
  });

  it("expands a member from their membership types", () => {
    expect([...helpRolesFor(socialMember)].sort()).toEqual(
      ["all", "social_member"].sort(),
    );
    expect([...helpRolesFor(campaignMember)].sort()).toEqual(
      ["all", "campaign_member"].sort(),
    );
    expect([...helpRolesFor(dualMember)].sort()).toEqual(
      ["all", "campaign_member", "social_member"].sort(),
    );
  });

  it("adds an election officer's memberships on top of the officer role", () => {
    expect([...helpRolesFor(electionOfficer)].sort()).toEqual(
      ["all", "election_officer"].sort(),
    );
    expect([...helpRolesFor(campaignOfficer)].sort()).toEqual(
      ["all", "campaign_member", "election_officer"].sort(),
    );
  });

  it("treats an unknown or missing access role as a plain member", () => {
    expect([...helpRolesFor({})].sort()).toEqual(["all"]);
    expect([
      ...helpRolesFor({ access_role: "something_else", membership_types: null }),
    ]).toEqual(["all"]);
  });
});

describe("help article visibility", () => {
  it("gives an anonymous visitor only articles marked all", () => {
    const visible = filterHelpArticles(HELP_ARTICLES, anonymous);

    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((article) => article.roles.includes("all"))).toBe(true);
    expect(visible.map((article) => article.id)).not.toContain("admin-overview");
    expect(visible.map((article) => article.id)).not.toContain("manage-members");
    expect(visible.map((article) => article.id)).not.toContain("coordination");
  });

  it("gives an administrator the whole library, nothing filtered", () => {
    expect(filterHelpArticles(HELP_ARTICLES, admin)).toHaveLength(
      HELP_ARTICLES.length,
    );
  });

  it("never shows an admin-only article to a campaign member", () => {
    const visible = new Set(ids(filterHelpArticles(HELP_ARTICLES, campaignMember)));

    expect(ADMIN_ONLY_IDS.length).toBeGreaterThan(0);
    for (const id of ADMIN_ONLY_IDS) {
      expect(visible.has(id)).toBe(false);
    }
  });

  it("never shows an admin-only article to an election officer", () => {
    const visible = new Set(ids(filterHelpArticles(HELP_ARTICLES, electionOfficer)));

    for (const id of ADMIN_ONLY_IDS) {
      expect(visible.has(id)).toBe(false);
    }
  });

  it("still gives an election officer the officer library", () => {
    const visible = ids(filterHelpArticles(HELP_ARTICLES, electionOfficer));

    expect(visible).toContain("officer-review");
    expect(visible).toContain("election-incidents");
    expect(visible).toContain("pu-reports");
  });

  it("keeps campaign material away from a social-only member", () => {
    const visible = ids(filterHelpArticles(HELP_ARTICLES, socialMember));

    expect(visible).toContain("social-tasks");
    expect(visible).not.toContain("assignments");
    expect(visible).not.toContain("member-directory");
  });

  it("gives a campaign member the campaign library but not election review", () => {
    const visible = ids(filterHelpArticles(HELP_ARTICLES, campaignMember));

    expect(visible).toContain("assignments");
    expect(visible).toContain("field-reports");
    expect(visible).toContain("my-area");
    expect(visible).not.toContain("officer-review");
  });

  it("expands an officer who is also a campaign member", () => {
    const visible = ids(filterHelpArticles(HELP_ARTICLES, campaignOfficer));

    expect(visible).toContain("officer-review");
    expect(visible).toContain("assignments");
  });

  it("shows every public article to every signed-in role", () => {
    const publicArticles = HELP_ARTICLES.filter(
      (article) => article.roles.length === 1 && article.roles[0] === "all",
    );

    expect(publicArticles.length).toBeGreaterThan(0);
    for (const viewer of [
      socialMember,
      campaignMember,
      electionOfficer,
      admin,
      anonymous,
    ]) {
      for (const article of publicArticles) {
        expect(helpVisibleTo(article, viewer)).toBe(true);
      }
    }
  });

  it("gives every article a non-empty role list", () => {
    for (const article of HELP_ARTICLES) {
      expect(article.roles.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate article ids", () => {
    const all = ids(HELP_ARTICLES);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("guide sections", () => {
  it("an administrator gets all six chapters", () => {
    expect(guideSectionsFor(admin).map((section) => section.id)).toEqual(
      GUIDE_SECTIONS.map((section) => section.id),
    );
  });

  it("an anonymous visitor only gets the public chapters", () => {
    expect(guideSectionsFor(anonymous).map((section) => section.id)).toEqual([
      "getting-started",
      "help",
    ]);
  });

  it("a campaign member never sees Administration in the table of contents", () => {
    const sections = guideSectionsFor(campaignMember);

    expect(sections.map((section) => section.id)).not.toContain("administration");
    expect(sections.map((section) => section.id)).toContain("coordinator");
  });

  it("an election officer gets Election Operations but not Administration", () => {
    const sectionIds = guideSectionsFor(electionOfficer).map((section) => section.id);

    expect(sectionIds).toContain("election");
    expect(sectionIds).not.toContain("administration");
  });

  it("drops chapters whose articles are all out of reach", () => {
    const socialSections = guideSectionsFor(socialMember).map((section) => section.id);

    expect(socialSections).not.toContain("campaign");
    expect(socialSections).not.toContain("coordinator");
    expect(socialSections).not.toContain("election");
  });

  it("never renders an article its reader cannot open", () => {
    for (const viewer of [anonymous, socialMember, campaignMember, electionOfficer]) {
      for (const section of guideSectionsFor(viewer)) {
        for (const article of section.articles) {
          expect(helpVisibleTo(article, viewer)).toBe(true);
        }
      }
    }
  });

  it("references only real articles", () => {
    const known = new Set(ids(HELP_ARTICLES));

    for (const [section, articleIds] of Object.entries(GUIDE_SECTION_ARTICLES)) {
      expect(articleIds.length, `section ${section} is empty`).toBeGreaterThan(0);
      for (const id of articleIds) {
        expect(known.has(id), `unknown article id ${id} in ${section}`).toBe(true);
      }
    }
  });

  it("has unique, stable anchor ids", () => {
    const all = GUIDE_SECTIONS.map((section) => section.id);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("route help", () => {
  it("points every public page at something an anonymous visitor can read", () => {
    const publicRoutes = [
      "/",
      "/login",
      "/volunteer",
      "/register-inec-officer",
      "/about",
      "/news",
      "/biography",
      "/manifesto",
      "/gallery",
      "/structure",
      "/contact",
    ];

    for (const route of publicRoutes) {
      const articles = helpArticlesForRoute(route);
      expect(articles.length, `no help mapped for ${route}`).toBeGreaterThan(0);

      const readable = filterHelpArticles(
        articles
          .map((id) => HELP_ARTICLES.find((article) => article.id === id))
          .filter((article): article is (typeof HELP_ARTICLES)[number] =>
            Boolean(article),
          ),
        anonymous,
      );

      expect(readable.length, `no public help for ${route}`).toBeGreaterThan(0);
    }
  });

  it("maps only real article ids", () => {
    const known = new Set(ids(HELP_ARTICLES));

    for (const [route, articleIds] of Object.entries(HELP_ROUTE_MAP)) {
      for (const id of articleIds) {
        expect(known.has(id), `${route} points at unknown ${id}`).toBe(true);
      }
    }
  });

  it("keeps admin management pages on admin articles", () => {
    expect(helpArticlesForRoute("/portal/admin/announcements")).toContain(
      "events-admin",
    );
    expect(helpArticlesForRoute("/portal/admin/news")).toContain("news-images");
    expect(helpArticlesForRoute("/portal/election/upload")).toContain(
      "duplicate-result-submission",
    );
  });
});
