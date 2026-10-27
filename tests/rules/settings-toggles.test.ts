import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { sectionVisible } from "@/lib/public-content";
import { parseCachedSettings } from "@/lib/settings-cache";
import { anonDb, authAs, seedUser } from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * ============================================================
 * HOMEPAGE SECTION TOGGLES
 * ============================================================
 *
 * Every homepage section reads its `show` flag from
 * `site_settings/general`. The homepage uses `sectionVisible()` on
 * each flag, so the tests below pin both halves: the rules that store
 * the flags, and the helper that decides whether a section renders.
 */

const SETTINGS = {
  bioTeaser: {
    show: false,
    heading: "The Candidate",
    imageUrl: "",
    buttonLabel: "Read Full Biography",
    buttonLink: "/biography",
  },
  manifestoTeaser: {
    show: false,
    heading: "The Manifesto",
    body: "",
    buttonLabel: "Read Full Manifesto",
    buttonLink: "/manifesto",
  },
  newsSection: {
    show: false,
    heading: "Latest News",
    count: 3,
    seeAllLabel: "View All →",
    seeAllLink: "/news",
  },
  eventsSection: { show: false, heading: "Upcoming Events", count: 3 },
  campaignCtas: [
    {
      id: "volunteer",
      label: "Volunteer for the Campaign",
      link: "/volunteer",
      kind: "volunteer",
      enabled: true,
    },
    {
      id: "donate",
      label: "Donate",
      link: "",
      kind: "donate",
      enabled: true,
    },
  ],
  donation: {
    donateEnabled: false,
    bankName: "",
    accountName: "",
    accountNumber: "",
    donationNote: "",
  },
};

async function seedSettings(payload: Record<string, unknown>) {
  await getTestEnv().withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "site_settings", "general"), payload);
  });
}

describe("homepage section toggles", () => {
  beforeAll(async () => {
    await initTestEnv();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  beforeEach(async () => {
    await clearDb();
    await seedUser("admin-uid", { access_role: "admin" });
  });

  it("lets an admin save toggles to site_settings/general", async () => {
    await assertSucceeds(
      setDoc(doc(authAs("admin-uid"), "site_settings", "general"), SETTINGS),
    );
  });

  it("rejects a toggle change from an unauthenticated visitor", async () => {
    await assertFails(
      setDoc(doc(anonDb(), "site_settings", "general"), SETTINGS),
    );
  });

  it("serves the saved toggles to the public homepage", async () => {
    await seedSettings(SETTINGS);

    await assertSucceeds(getDoc(doc(anonDb(), "site_settings", "general")));

    const snap = await getDoc(doc(anonDb(), "site_settings", "general"));
    expect(snap.exists()).toBe(true);
  });

  it("hides every section whose toggle is off", async () => {
    await seedSettings(SETTINGS);

    const snap = await getDoc(doc(anonDb(), "site_settings", "general"));
    const settings = snap.data() as {
      bioTeaser: { show: boolean };
      manifestoTeaser: { show: boolean };
      newsSection: { show: boolean };
      eventsSection: { show: boolean };
    };

    expect(sectionVisible(settings.bioTeaser)).toBe(false);
    expect(sectionVisible(settings.manifestoTeaser)).toBe(false);
    expect(sectionVisible(settings.newsSection)).toBe(false);
    expect(sectionVisible(settings.eventsSection)).toBe(false);
  });

  it("keeps a section visible unless it is explicitly turned off", () => {
    expect(sectionVisible({ show: true })).toBe(true);
    /* A settings document written before the toggle existed still
     * renders its section. */
    expect(sectionVisible({})).toBe(true);
    expect(sectionVisible(undefined)).toBe(true);
  });

  it("hides the donate CTA while donations are switched off", async () => {
    await seedSettings(SETTINGS);

    const snap = await getDoc(doc(anonDb(), "site_settings", "general"));
    const settings = snap.data() as {
      campaignCtas: Array<{ id: string; kind: string; enabled: boolean }>;
      donation: { donateEnabled: boolean };
    };

    const visible = settings.campaignCtas.filter(
      (cta) =>
        cta.enabled &&
        (cta.kind !== "donate" || settings.donation.donateEnabled),
    );

    expect(visible.map((cta) => cta.id)).toEqual(["volunteer"]);
  });

  it("reads Firestore first and uses the cache only as a fallback", () => {
    /*
     * The read order lives in the source: getSiteSettings() must
     * attempt the Firestore document before consulting localStorage,
     * otherwise a saved toggle is masked by a stale cached copy.
     */
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/lib/firebase/site-settings.ts", import.meta.url),
      ),
      "utf8",
    );

    const body = source.slice(
      source.indexOf("export async function getSiteSettings"),
    );

    const firestoreRead = body.indexOf("getDoc(docRef)");
    const cacheRead = body.indexOf("parseCachedSettings");

    expect(firestoreRead).toBeGreaterThan(-1);
    expect(cacheRead).toBeGreaterThan(-1);
    expect(firestoreRead).toBeLessThan(cacheRead);
  });

  it("seeds the homepage from the cached copy before awaiting Firestore", () => {
    /*
     * A returning visitor must not see the default toggles while the
     * network responds: the page applies the cached settings, flips the
     * section gate, and only then awaits the live document (which
     * overwrites the seed).
     */
    const page = readFileSync(
      fileURLToPath(new URL("../../src/app/page.tsx", import.meta.url)),
      "utf8",
    );

    const seed = page.indexOf("readCachedSiteSettings()");
    const ready = page.indexOf("setSettingsReady(true)");
    const fetch = page.indexOf("await getSiteSettings()");

    expect(seed).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(seed);
    expect(fetch).toBeGreaterThan(ready);

    /* Nothing settings-driven paints before the seed resolves. */
    expect(page).toContain("{!settingsReady && <HomeSectionsSkeleton />}");
    expect(page).toContain("{settingsReady && settings.heroShow !== false && (");
  });

  it("parses only usable cached settings", () => {
    expect(parseCachedSettings(JSON.stringify(SETTINGS))).toMatchObject({
      bioTeaser: { show: false },
    });
    expect(parseCachedSettings(null)).toBeNull();
    expect(parseCachedSettings("")).toBeNull();
    expect(parseCachedSettings("not json")).toBeNull();
    expect(parseCachedSettings("[1,2,3]")).toBeNull();
  });
});
