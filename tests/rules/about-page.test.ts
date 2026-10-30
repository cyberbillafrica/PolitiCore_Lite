import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * /about is static product marketing: no auth, no Firestore, no
 * candidate content. These are source assertions; visual rendering is a
 * manual browser check.
 */

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const about = read("src/app/about/page.tsx");
const layout = read("src/app/portal/layout.tsx");

const FEATURE_TITLES = [
  "Campaign Coordination",
  "Election Operations",
  "Role-Based Access",
  "Real-Time Notifications",
  "Immutable Audit Trail",
  "Mobile-Ready",
  "Content Management",
  "Brandable Per Client",
];

/** Exact, case-sensitive filenames shipped in public/screenshots/. */
const SCREENSHOTS = [
  "Dashboard.png",
  "Election-Upload.png",
  "Result-Center.png",
  "Central-Settings.png",
  "Social.png",
  "biography.png",
  "manifesto.png",
];

describe("/about marketing page", () => {
  it("is public: no auth gate, redirect, or Firestore read", () => {
    expect(about).not.toContain("useAuth");
    expect(about).not.toContain("redirect(");
    expect(about).not.toContain("getBiography");
    expect(about).not.toContain("force-dynamic");
  });

  it("offers the Request a Demo call to action at /contact", () => {
    expect(about).toContain("Request a Demo");
    expect(about).toContain('href="/contact"');
  });

  it("presents the product feature set", () => {
    const present = FEATURE_TITLES.filter((title) => about.includes(title));

    expect(present.length).toBeGreaterThanOrEqual(6);
  });

  it("references at least three screenshots, all of which exist", () => {
    const referenced = new Set(
      [...about.matchAll(/\/screenshots\/([A-Za-z0-9_.-]+\.png)/g)].map(
        (match) => match[1],
      ),
    );

    expect(referenced.size).toBeGreaterThanOrEqual(3);

    for (const file of referenced) {
      expect(
        existsSync(join(root, "public", "screenshots", file)),
        `${file} is referenced but missing`,
      ).toBe(true);
    }
  });

  it("uses all seven provided screenshots with their exact filenames", () => {
    for (const file of SCREENSHOTS) {
      expect(about).toContain(`/screenshots/${file}`);
    }
  });

  it("has none of the retired DCM Enugu content", () => {
    expect(about).not.toMatch(/DCM/);
    expect(about).not.toMatch(/Enugu/);
    expect(about).not.toMatch(/Mobilization/i);
    expect(about).not.toMatch(/Core Responsibilities/i);
  });

  it("carries no source candidate strings", () => {
    expect(about).not.toContain("Ifeanyi");
    expect(about).not.toContain("2027");
  });

  it("credits the platform developer", () => {
    expect(about).toContain("BRANDING.developerName");
  });
});

describe("Features navigation entry", () => {
  it("sits between Profile and User Guide & Manual as a sibling", () => {
    const profile = layout.indexOf('name: "Profile"');
    const features = layout.indexOf('name: "Features"');
    const guide = layout.indexOf('name: "User Guide & Manual"');

    expect(profile).toBeGreaterThan(-1);
    expect(features).toBeGreaterThan(profile);
    expect(guide).toBeGreaterThan(features);

    const block = layout.slice(features, guide);
    expect(block).toContain('href: "/about"');
    expect(block).toContain("icon: Sparkles");
    expect(block).not.toContain("group:");
  });

  it("is not added to the mobile bottom bar", () => {
    const bottomBar = layout.indexOf("Mobile Bottom Navigation Bar");

    expect(bottomBar).toBeGreaterThan(-1);

    const bottom = layout.slice(bottomBar);
    expect(bottom).not.toContain('"/about"');
    expect(bottom).not.toContain("Features");
  });
});
