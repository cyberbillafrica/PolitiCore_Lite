import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

/*
 * Service worker (Serwist).
 *
 * The app builds with webpack (`next build --webpack`), so the
 * webpack-based @serwist/next plugin is the correct integration.
 *
 * `reloadOnOnline` is deliberately false: a forced reload when
 * connectivity returns would discard a half-filled result-upload form
 * (polling unit, party figures, EC8 photo). Freshness comes from
 * navigation and refresh instead.
 *
 * The worker is disabled in development so `next dev` never serves a
 * stale precache.
 */
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  /*
   * `cacheOnNavigation` is deliberately OFF. It injects an entry worker
   * that writes every history.pushState/replaceState URL straight into
   * the `pages` cache, bypassing the service worker's routes — so a
   * signed-out redirect out of /portal/dashboard left that portal
   * document cached. Public pages are still cached by defaultCache's
   * NetworkFirst document strategy.
   */
  cacheOnNavigation: false,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",

  /*
   * The Serwist class resolves `fallbacks` from the precache but does NOT
   * add the fallback URL to it (only the deprecated helper did). Without
   * this entry the offline document is never cached and a failed
   * navigation shows the browser error instead of /~offline.
   *
   * The revision changes every build, so the offline page is refreshed on
   * the next deploy.
   */
  additionalPrecacheEntries: [
    {
      url: "/~offline",
      revision: new Date().toISOString(),
    },
  ],
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.195.129.227"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
};

export default withSerwist(nextConfig);
