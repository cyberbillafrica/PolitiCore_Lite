import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cloudinaryDownloadUrl,
  hasText,
  isValidHttpUrl,
  normalizeManifestoSections,
} from "@/lib/public-content";
import type { ManifestoSection } from "@/types";
import { anonDb } from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * ============================================================
 * MANIFESTO RENDER PATH
 * ============================================================
 *
 * `manifestos/main` is the single source of truth. /manifesto renders
 * the whole document — including the PDF embed when one is uploaded —
 * and every empty field is skipped instead of rendering as a blank
 * element.
 */

const PDF_URL =
  "https://res.cloudinary.com/demo/raw/upload/v1790000000/ifeanyi-2027/candidate/manifestos/manifesto.pdf";

const SECTIONS: ManifestoSection[] = [
  {
    id: "youth",
    title: "Youth Empowerment",
    icon: "🎓",
    description: "Skills and grants for young people.",
    points: ["Skill acquisition centres", "Youth grants"],
  },
  {
    id: "jobs",
    title: "Job Creation",
    icon: "🏗️",
    description: "Local infrastructure that hires locally.",
    points: ["Road rehabilitation"],
  },
];

function manifestoDoc(status: "draft" | "published") {
  return {
    title: "Our Manifesto",
    subtitle: "A blueprint for progress",
    introduction: "We will govern with transparency.",
    candidate_name: "Papa Chinedu",
    candidate_title: "Candidate, Nkanu West",
    sections: SECTIONS,
    closing: "", // deliberately empty in the live document
    call_to_action: "Join the Movement",
    call_to_action_link: "/volunteer",
    pdf_url: PDF_URL,
    status,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

async function seedManifesto(status: "draft" | "published") {
  await getTestEnv().withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "manifestos", "main"), manifestoDoc(status));
  });
}

describe("manifesto render path", () => {
  beforeAll(async () => {
    await initTestEnv();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  beforeEach(async () => {
    await clearDb();
  });

  it("lets an unauthenticated visitor read the published manifesto with its PDF", async () => {
    await seedManifesto("published");

    await assertSucceeds(getDoc(doc(anonDb(), "manifestos", "main")));

    const snap = await getDoc(doc(anonDb(), "manifestos", "main"));
    const data = snap.data() as { pdf_url: string; sections: ManifestoSection[] };

    expect(data.pdf_url).toBe(PDF_URL);
    expect(data.sections).toHaveLength(2);
  });

  it("denies an unauthenticated read of a draft manifesto", async () => {
    await seedManifesto("draft");

    await assertFails(getDoc(doc(anonDb(), "manifestos", "main")));
  });

  it("renders the PDF embed only when pdf_url is a valid URL", () => {
    expect(isValidHttpUrl(PDF_URL)).toBe(true);
    expect(isValidHttpUrl("")).toBe(false);
    expect(isValidHttpUrl(null)).toBe(false);
    expect(isValidHttpUrl("   ")).toBe(false);
    expect(isValidHttpUrl("not-a-url")).toBe(false);
    expect(isValidHttpUrl("/relative/path.pdf")).toBe(false);
  });

  it("skips an empty closing field instead of rendering it", () => {
    expect(hasText("")).toBe(false);
    expect(hasText("   ")).toBe(false);
    expect(hasText(null)).toBe(false);
    expect(hasText("Thank you for your support.")).toBe(true);
  });

  it("sections survive an empty description or empty points list", () => {
    const normalized = normalizeManifestoSections([
      { id: "a", title: "Works", description: "", points: ["One", "  "] },
      { id: "b", title: "Coming", description: "Later", points: [] },
      { id: "c", title: "   ", description: "dropped", points: ["x"] },
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized[0].description).toBe("");
    expect(normalized[0].points).toEqual(["One"]);
    expect(normalized[1].points).toEqual([]);
  });

  it("survives a document with no sections array at all", () => {
    expect(normalizeManifestoSections(undefined)).toEqual([]);
    expect(normalizeManifestoSections(null)).toEqual([]);
  });

  it("asks Cloudinary for attachment delivery so the download button saves the file", () => {
    /*
     * The raw delivery URL is what the iframe embeds (it is served
     * inline); browsers ignore `download` across origins, so the
     * download button points at the fl_attachment variant instead.
     */
    expect(cloudinaryDownloadUrl(PDF_URL)).toBe(
      "https://res.cloudinary.com/demo/raw/upload/fl_attachment/v1790000000/ifeanyi-2027/candidate/manifestos/manifesto.pdf",
    );
  });

  it("leaves non-Cloudinary and already-flagged URLs untouched", () => {
    const flagged =
      "https://res.cloudinary.com/demo/raw/upload/fl_attachment/v1/x.pdf";

    expect(cloudinaryDownloadUrl("https://example.com/manifesto.pdf")).toBe(
      "https://example.com/manifesto.pdf",
    );
    expect(cloudinaryDownloadUrl(flagged)).toBe(flagged);
    expect(cloudinaryDownloadUrl("")).toBe("");
    expect(cloudinaryDownloadUrl(null)).toBe("");
  });
});
