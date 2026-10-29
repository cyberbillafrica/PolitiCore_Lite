import type { MetadataRoute } from "next";

import { BRANDING } from "@/config/branding";

/*
 * Web app manifest.
 *
 * Name and colour come from BRANDING so a cloned deployment installs
 * under its own name without a code change. The colour is the build-time
 * seed only — an admin override in site_settings/general cannot reach a
 * static manifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRANDING.appName,
    short_name: BRANDING.shortName || BRANDING.appName,
    description: BRANDING.tagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: BRANDING.primaryColor || "#008751",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
