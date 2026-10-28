import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BRANDING } from "@/config/branding";
import {
  GUIDE_ATTRIBUTION,
  GUIDE_TITLE,
  HELP_ARTICLES,
  HELP_ATTRIBUTION,
} from "@/lib/help-content";

/*
 * ============================================================
 * PRODUCT-LEVEL HELP BRANDING — ROUND 13
 * ============================================================
 *
 * The help library and the guide ship with every clone, so they must
 * describe the product (PolitiCore) and never the candidate a given
 * deployment happens to serve. Candidate branding lives in env vars
 * and in site_settings; the help files stay generic.
 *
 * The source assertions are deliberate: they catch a hardcoded
 * candidate name that no runtime import would ever reveal.
 */

const HELP_SURFACES = [
  "src/lib/help-content.ts",
  "src/app/portal/guide/page.tsx",
  "src/components/help/ContextualHelp.tsx",
  "src/components/help/HelpLink.tsx",
] as const;

const read = (relativePath: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    "utf8",
  );

describe("product branding in help surfaces", () => {
  it("names the product PolitiCore and credits CyberBill Africa", () => {
    expect(BRANDING.shortName).toBe("PolitiCore");
    expect(BRANDING.developerName).toBe("CyberBill Africa");

    expect(GUIDE_TITLE).toBe("PolitiCore — Campaign Operations Guide");
    expect(GUIDE_ATTRIBUTION).toBe("PolitiCore — a product of CyberBill Africa");
    expect(HELP_ATTRIBUTION).toBe("PolitiCore by CyberBill Africa");
  });

  it.each(HELP_SURFACES)("%s contains no candidate-specific strings", (file) => {
    const source = read(file);

    expect(source).not.toMatch(/\bIfeanyi\b/);
    expect(source).not.toMatch(/Nkanu/i);
    expect(source).not.toMatch(/\bAPC\b/);
    expect(source).not.toMatch(/\b2027\b/);
    expect(source).not.toMatch(/Ifeanyi 2027/);
  });

  it("renders the product attribution in the guide and the help panel", () => {
    const guide = read("src/app/portal/guide/page.tsx");
    const panel = read("src/components/help/ContextualHelp.tsx");

    expect(guide).toContain("GUIDE_TITLE");
    expect(guide).toContain("GUIDE_ATTRIBUTION");
    expect(guide).toContain("BRANDING.shortName");
    expect(guide).toContain("guideSectionsFor");

    expect(panel).toContain("HELP_ATTRIBUTION");
    expect(panel).toContain("filterHelpArticles");
    expect(panel).toContain("viewer");
  });

  it("never reads candidate-only branding from the help library", () => {
    /* An empty candidate (the product demo) must not change any help text. */
    const content = read("src/lib/help-content.ts");

    expect(content).not.toContain("BRANDING.candidateName");
    expect(content).not.toContain("BRANDING.candidateFullName");
    expect(content).not.toContain("BRANDING.appName");
    expect(content).not.toContain("BRANDING.electionYear");
  });

  it("builds the guide title and attribution from BRANDING, not literals", () => {
    const content = read("src/lib/help-content.ts");

    expect(content).toContain("GUIDE_TITLE = `${BRANDING.shortName}");
    expect(content).toContain("BRANDING.developerName");
    expect(content).not.toMatch(/\bIfeanyi\b/);
  });

  it("keeps the documentation page metadata product-level", () => {
    const documentation = read("src/app/documentation/page.tsx");

    expect(documentation).not.toContain("candidateLegalName");
    expect(documentation).not.toContain("electionYear");
    expect(documentation).not.toContain("BRANDING.appName");
    expect(documentation).toContain("BRANDING.shortName");
    expect(documentation).toContain("BRANDING.tagline");
  });
});

describe("the added help articles", () => {
  const byId = (id: string) => {
    const article = HELP_ARTICLES.find((entry) => entry.id === id);
    expect(article, `missing article ${id}`).toBeTruthy();
    return article!;
  };

  it("documents the public site for everyone", () => {
    const article = byId("about-the-public-site");

    expect(article.roles).toEqual(["all"]);
    expect(article.category).toBe("getting-started");
    expect(article.body.join(" ")).toMatch(/Volunteer/);
    expect(article.body.join(" ")).toMatch(/Contact/);
  });

  it("documents duplicate result submissions for members and officers", () => {
    const article = byId("duplicate-result-submission");

    expect(article.category).toBe("election");
    expect(article.roles).toContain("campaign_member");
    expect(article.roles).toContain("election_officer");
    expect(article.roles).not.toContain("all");
    expect(article.roles).not.toContain("admin");
  });

  it("documents the events admin for administrators only", () => {
    const article = byId("events-admin");

    expect(article.category).toBe("administration");
    expect(article.roles).toEqual(["admin"]);
    expect(article.body.join(" ")).toMatch(/Upcoming Events/);
  });

  it("documents the news gallery for administrators only", () => {
    const article = byId("news-images");

    expect(article.category).toBe("administration");
    expect(article.roles).toEqual(["admin"]);
    expect(article.body.join(" ")).toMatch(/additional images/i);
  });
});
