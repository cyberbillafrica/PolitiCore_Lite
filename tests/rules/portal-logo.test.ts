import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * The portal layout is a client component, so these are structural
 * assertions on the source: the logo decision is two branches in the
 * same component that renders the existing monogram plate. Rendering is
 * a manual browser check.
 */

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const layout = read("src/app/portal/layout.tsx");

const brandLogoStart = layout.indexOf("function PortalBrandLogo");
const brandLogoEnd = layout.indexOf("function UserPanel", brandLogoStart);
const brandLogo =
  brandLogoStart === -1
    ? ""
    : layout.slice(brandLogoStart, brandLogoEnd === -1 ? undefined : brandLogoEnd);

describe("portal brand logo", () => {
  it("reads site settings at runtime, cached copy first", () => {
    expect(layout).toContain("readCachedSiteSettings()");
    expect(layout).toContain("getSiteSettings()");
    expect(layout).toContain("settings.logoUrl ?? \"\"");
  });

  it("renders an uploaded logo as an image", () => {
    expect(brandLogo).toContain("<img");
    expect(brandLogo).toContain("src={logoUrl}");
    expect(brandLogo).toContain('alt={BRANDING.brandName}');
    expect(brandLogo).toContain("object-contain");
  });

  it("renders the monogram when no logo is set", () => {
    expect(brandLogo).toContain("{BRANDING.monogram}");
    expect(brandLogo).toContain("bg-emerald-700");
  });

  it("keeps the h-8 w-8 plate in both branches", () => {
    const plates = brandLogo.match(/h-8 w-8/g) ?? [];

    expect(plates.length).toBeGreaterThanOrEqual(2);
  });

  it("updates every portal chrome location, not just one", () => {
    /*
     * Mobile sidebar, desktop sidebar, and the mobile top header.
     * Missing the last one leaves the old monogram on phones.
     */
    const usages = layout.match(/<PortalBrandLogo logoUrl={logoUrl} \/>/g) ?? [];

    expect(usages).toHaveLength(3);
  });
});
