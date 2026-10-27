import { assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { isPublished, previewParagraphs } from "@/lib/public-content";
import { anonDb } from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * ============================================================
 * BIOGRAPHY RENDER PATH
 * ============================================================
 *
 * `biographies/main` is the single source of truth for the candidate
 * biography: /biography renders the whole `about`, and the homepage
 * teaser renders only its first paragraphs. Both read the same
 * document, and both gate on `status === "published"`.
 */

const PARAGRAPHS = [
  "Papa Chinedu grew up in Nkanu West.",
  "He built a career in community service.",
  "He founded three local cooperatives.",
  "He served two terms in the state assembly.",
  "He is running to finish what he started.",
];

const BIO_BODY = PARAGRAPHS.join("\n\n");

async function seedBiography(status: "draft" | "published") {
  await getTestEnv().withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "biographies", "main"), {
      full_name: "Papa Chinedu",
      title: "Candidate, Nkanu West",
      about: BIO_BODY,
      image_url: null,
      stats: { years_experience: 12, communities_served: 30, volunteers: 400 },
      social_links: {},
      status,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });
}

describe("biography render path", () => {
  beforeAll(async () => {
    await initTestEnv();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  beforeEach(async () => {
    await clearDb();
  });

  it("lets an unauthenticated visitor read the published biography", async () => {
    await seedBiography("published");

    await assertSucceeds(getDoc(doc(anonDb(), "biographies", "main")));
  });

  it("does not render a draft biography on the public page", async () => {
    /* The page gate: a draft (or missing) document renders the Coming
     * Soon screen, never the body. */
    expect(isPublished({ status: "draft" })).toBe(false);
    expect(isPublished(null)).toBe(false);
    expect(isPublished({ status: "published" })).toBe(true);
  });

  it("renders the full body from biographies/main", async () => {
    await seedBiography("published");

    const snap = await getDoc(doc(anonDb(), "biographies", "main"));
    const about = (snap.data() as { about: string }).about;

    expect(about).toBe(BIO_BODY);
    expect(previewParagraphs(about)).toHaveLength(3);
    expect(about).toContain(PARAGRAPHS[4]);
  });

  it("shows only the first three paragraphs in the homepage teaser", async () => {
    await seedBiography("published");

    const snap = await getDoc(doc(anonDb(), "biographies", "main"));
    const about = (snap.data() as { about: string }).about;

    const preview = previewParagraphs(about);

    expect(preview).toEqual([PARAGRAPHS[0], PARAGRAPHS[1], PARAGRAPHS[2]]);
    expect(preview.join("\n")).not.toContain(PARAGRAPHS[3]);
  });

  it("renders an empty biography body gracefully", () => {
    /* An empty `about` yields no paragraphs, so the homepage shows its
     * placeholder instead of an empty paragraph. */
    expect(previewParagraphs("")).toEqual([]);
    expect(previewParagraphs(null)).toEqual([]);
  });
});
