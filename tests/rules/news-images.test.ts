import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { normalizeNewsArticle } from "@/lib/firebase/firestore";
import { anonDb, authAs, seedUser } from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * ============================================================
 * NEWS MULTI-IMAGE SUPPORT
 * ============================================================
 *
 * The article page may show up to two extra images ("More from this
 * story"); the news list and the homepage cards keep using only the
 * featured image. Articles written before the field existed must
 * render exactly as they did before.
 */

const FEATURE =
  "https://res.cloudinary.com/demo/image/upload/v1/ifeanyi-2027/news/feature.jpg";
const EXTRA_ONE =
  "https://res.cloudinary.com/demo/image/upload/v1/ifeanyi-2027/news/extra-1.jpg";
const EXTRA_TWO =
  "https://res.cloudinary.com/demo/image/upload/v1/ifeanyi-2027/news/extra-2.jpg";

function legacyArticleFields() {
  return {
    title: "Legacy article",
    slug: "legacy-article",
    excerpt: "Written before additional images existed.",
    content: "Full article body.",
    featured_image: FEATURE,
    status: "published",
    published: true,
    author: "Campaign Media Office",
    created_by: "admin-uid",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function multiImageArticleFields() {
  return {
    ...legacyArticleFields(),
    title: "Multi-image article",
    slug: "multi-image-article",
    additional_images: [EXTRA_ONE, EXTRA_TWO],
  };
}

async function seedArticle(id: string, fields: Record<string, unknown>) {
  await getTestEnv().withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "news", id), fields);
  });
}

describe("news multi-image support", () => {
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

  it("renders a legacy article from its featured image alone", async () => {
    await seedArticle("legacy", legacyArticleFields());

    const snap = await getDoc(doc(anonDb(), "news", "legacy"));
    const article = normalizeNewsArticle(snap.id, snap.data() as Record<string, unknown>);

    expect(article.featured_image).toBe(FEATURE);
    expect(article.additional_images).toEqual([]);
  });

  it("keeps both extra images on the article page gallery", async () => {
    await seedArticle("multi", multiImageArticleFields());

    const snap = await getDoc(doc(anonDb(), "news", "multi"));
    const article = normalizeNewsArticle(snap.id, snap.data() as Record<string, unknown>);

    const gallery = article.additional_images ?? [];
    expect(gallery).toEqual([EXTRA_ONE, EXTRA_TWO]);
  });

  it("still shows only the featured image on cards", async () => {
    await seedArticle("multi", multiImageArticleFields());

    const snap = await getDoc(doc(anonDb(), "news", "multi"));
    const article = normalizeNewsArticle(snap.id, snap.data() as Record<string, unknown>);

    /* The card renders `featured_image` only — the gallery is a
     * separate list the list/homepage views never read. */
    expect(article.featured_image).toBe(FEATURE);
    expect(article.additional_images).not.toContain(FEATURE);
  });

  it("ignores blank entries and caps the gallery at two images", () => {
    const article = normalizeNewsArticle("mixed", {
      ...legacyArticleFields(),
      additional_images: [EXTRA_ONE, "   ", EXTRA_TWO, "https://example.com/third.jpg"],
    });

    expect(article.additional_images).toEqual([EXTRA_ONE, EXTRA_TWO]);
  });

  it("survives a non-array additional_images value", () => {
    const article = normalizeNewsArticle("broken", {
      ...legacyArticleFields(),
      additional_images: "not-an-array",
    });

    expect(article.additional_images).toEqual([]);
  });

  it("lets the public read a published article and denies a draft", async () => {
    await seedArticle("published", multiImageArticleFields());
    await seedArticle("draft", {
      ...multiImageArticleFields(),
      status: "draft",
      published: false,
    });

    await assertSucceeds(getDoc(doc(anonDb(), "news", "published")));
    await assertFails(getDoc(doc(anonDb(), "news", "draft")));
  });

  it("lets an admin write the gallery images", async () => {
    await assertSucceeds(
      setDoc(doc(authAs("admin-uid"), "news", "written-by-admin"), {
        ...multiImageArticleFields(),
        created_by: "admin-uid",
      }),
    );
  });
});
