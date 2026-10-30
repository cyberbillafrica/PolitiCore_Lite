import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * BRANDING is evaluated once per module load, so each case stubs the
 * env and imports a fresh copy. The template has no
 * NEXT_PUBLIC_BRAND_APP_NAME, which must fall back to the product name
 * rather than the source deployment's campaign name.
 */

async function importBranding() {
  vi.resetModules();
  return (await import("@/config/branding")).BRANDING;
}

describe("BRANDING.appName fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the product short name when no app name is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_APP_NAME", "");
    vi.stubEnv("NEXT_PUBLIC_BRAND_SHORT_NAME", "");

    const branding = await importBranding();

    expect(branding.shortName).toBe("PolitiCore");
    expect(branding.appName).toBe(branding.shortName);
    expect(branding.appName).toBe("PolitiCore");
  });

  it("keeps the product short name independent of the app name", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_APP_NAME", "");
    vi.stubEnv("NEXT_PUBLIC_BRAND_SHORT_NAME", "PolitiCore Campaign OS");

    const branding = await importBranding();

    expect(branding.shortName).toBe("PolitiCore Campaign OS");
    expect(branding.appName).toBe("PolitiCore Campaign OS");
  });

  it("uses NEXT_PUBLIC_BRAND_APP_NAME when a clone sets it", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_APP_NAME", "Ifeanyi 2027");
    vi.stubEnv("NEXT_PUBLIC_BRAND_SHORT_NAME", "PolitiCore");

    const branding = await importBranding();

    expect(branding.appName).toBe("Ifeanyi 2027");
    expect(branding.shortName).toBe("PolitiCore");
  });

  it("never falls back to the source candidate name", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_APP_NAME", "");
    vi.stubEnv("NEXT_PUBLIC_BRAND_SHORT_NAME", "");

    const branding = await importBranding();

    expect(branding.appName).not.toBe("Ifeanyi 2027");
  });
});
