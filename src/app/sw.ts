/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

import { isAuthenticatedPath, isFirebaseHost } from "../lib/pwa";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/*
 * ============================================================
 * SERVICE WORKER — APP SHELL ONLY
 * ============================================================
 *
 * What it caches: the Next build's static assets (JS, CSS, fonts,
 * images) and public pages, so the installed app opens quickly and
 * shows a branded /~offline page instead of the browser's dinosaur.
 *
 * What it never caches: Firebase. Firestore talks over a long-lived
 * WebChannel and Auth/Storage are per-session; a cached answer would
 * be stale at best and a data-leak vector at worst. The NetworkOnly
 * entries below are registered BEFORE defaultCache, which is the
 * order Serwist matches routes in.
 *
 * Signed-in documents (/portal/*, /login) are also NetworkOnly: the
 * portal layout is a client-side auth gate, so a cached shell would
 * flash “Loading your portal…” to a visitor who has just signed out.
 *
 * Deliberately no Firestore offline persistence — that is a separate
 * data-layer decision.
 */

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => isFirebaseHost(url.hostname),
      handler: new NetworkOnly(),
    },
    {
      /*
       * Every request on a signed-in path — the document AND the RSC
       * payload/prefetch for it. defaultCache would otherwise cache the
       * RSC response for 24 hours, which is exactly the stale portal
       * shell this rule exists to prevent.
       */
      matcher: ({ url }) =>
        url.origin === self.location.origin &&
        isAuthenticatedPath(url.pathname),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
