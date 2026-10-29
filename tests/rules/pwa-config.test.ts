import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import { BRANDING } from "@/config/branding";

/*
 * These are configuration assertions, not browser tests. Service-worker
 * runtime behaviour (precache hit, offline fallback, NetworkOnly pass
 * through) needs a real browser and is called out in the Round 14
 * report as manual verification.
 */

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("web app manifest", () => {
  const appManifest = manifest();

  it("names the install from BRANDING.appName", () => {
    expect(appManifest.name).toBe(BRANDING.appName);
  });

  it("uses the product short name", () => {
    expect(appManifest.short_name).toBe(
      BRANDING.shortName || BRANDING.appName,
    );
  });

  it("uses the tagline as its description", () => {
    expect(appManifest.description).toBe(BRANDING.tagline);
  });

  it("launches standalone at the site root", () => {
    expect(appManifest.start_url).toBe("/");
    expect(appManifest.scope).toBe("/");
    expect(appManifest.display).toBe("standalone");
    expect(appManifest.background_color).toBe("#ffffff");
  });

  it("themes with the BRANDING primary colour", () => {
    expect(appManifest.theme_color).toBe(BRANDING.primaryColor);
  });

  it("declares 192, 512 and a maskable 512 icon", () => {
    const icons = appManifest.icons ?? [];

    expect(icons).toHaveLength(3);
    expect(icons.map((icon) => icon.sizes)).toEqual([
      "192x192",
      "512x512",
      "512x512",
    ]);
    expect(icons.map((icon) => icon.purpose)).toEqual([
      "any",
      "any",
      "maskable",
    ]);
  });

  it("points every icon at a real file with the expected name", () => {
    const sources = (appManifest.icons ?? []).map((icon) => icon.src);

    expect(sources).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-512.png",
    ]);

    for (const src of sources) {
      expect(existsSync(join(root, "public", src)), `${src} is missing`).toBe(
        true,
      );
    }
  });

  it("references an apple touch icon that exists", () => {
    expect(
      existsSync(join(root, "public", "icons", "apple-touch-icon.png")),
    ).toBe(true);
  });
});

describe("service worker configuration", () => {
  const nextConfig = read("next.config.ts");
  const worker = read("src/app/sw.ts");

  it("builds the worker from src/app/sw.ts into public/sw.js", () => {
    expect(nextConfig).toContain('swSrc: "src/app/sw.ts"');
    expect(nextConfig).toContain('swDest: "public/sw.js"');
  });

  it("does not reload the page when connectivity returns", () => {
    expect(nextConfig).toContain("reloadOnOnline: false");
    expect(nextConfig).not.toContain("reloadOnOnline: true");
  });

  it("does not cache pushState navigations outside the worker routes", () => {
    expect(nextConfig).toContain("cacheOnNavigation: false");
    expect(nextConfig).not.toContain("cacheOnNavigation: true");
  });

  it("is disabled in development", () => {
    expect(nextConfig).toContain('process.env.NODE_ENV === "development"');
  });

  it("registers NetworkOnly for Firebase and signed-in routes", () => {
    expect(worker).toContain("new NetworkOnly()");
    expect(worker).toContain("isFirebaseHost(url.hostname)");
    expect(worker).toContain("isAuthenticatedPath(url.pathname)");
  });

  it("covers RSC payloads on signed-in routes, not just documents", () => {
    expect(worker).not.toContain('request.mode === "navigate"');
  });

  it("places the NetworkOnly rules before defaultCache", () => {
    const networkOnlyIndex = worker.indexOf("new NetworkOnly()");
    const defaultCacheIndex = worker.indexOf("...defaultCache");

    expect(networkOnlyIndex).toBeGreaterThan(-1);
    expect(defaultCacheIndex).toBeGreaterThan(networkOnlyIndex);
  });

  it("falls back to the static offline page for documents", () => {
    expect(worker).toContain('url: "/~offline"');
    expect(worker).toContain('request.destination === "document"');
  });

  it("precaches the offline document so the fallback can resolve", () => {
    expect(nextConfig).toContain("additionalPrecacheEntries");
    expect(nextConfig).toContain('url: "/~offline"');
  });
});

describe("root layout PWA metadata", () => {
  const layout = read("src/app/layout.tsx");

  it("declares themeColor through the viewport export", () => {
    expect(layout).toContain("export const viewport: Viewport");
    expect(layout).toContain("themeColor: BRANDING.primaryColor");
  });

  it("does not use the deprecated metadata.themeColor", () => {
    const metadataStart = layout.indexOf("export const metadata");
    const metadataEnd = layout.indexOf("\n};", metadataStart);
    const metadataBlock = layout.slice(metadataStart, metadataEnd);

    expect(metadataBlock).not.toMatch(/themeColor\s*:/);
  });

  it("declares the legacy Apple standalone capability for older iOS", () => {
    expect(layout).toContain('"apple-mobile-web-app-capable": "yes"');
  });

  it("mounts both install offers once at the root", () => {
    expect(layout.match(/<InstallPrompt \/>/g)).toHaveLength(1);
    expect(layout.match(/<IosInstallHint \/>/g)).toHaveLength(1);
  });
});
