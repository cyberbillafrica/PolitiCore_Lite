import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { startOfToday } from "@/lib/firebase/events";
import { anonDb, authAs, seedUser } from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * ============================================================
 * HOMEPAGE EVENTS (events/{eventId})
 * ============================================================
 *
 * Events live in their own collection. The public homepage runs one
 * query — published events on/after today, ascending, limit 3 — and
 * the rules must both allow that query and hide drafts.
 */

function dayOffset(offsetDays: number): Timestamp {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() + offsetDays);
  return Timestamp.fromDate(day);
}

function eventFields(overrides: Record<string, unknown> = {}) {
  return {
    title: "Ward Meeting",
    description: "Monthly ward meeting",
    date: dayOffset(1),
    time: "10:00",
    venue: "Agbani Town Hall",
    lga_id: "nkanu-west",
    ward_id: "nkanu-west-ward-12",
    status: "published",
    created_by: "admin-uid",
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

async function seedEvent(id: string, overrides: Record<string, unknown> = {}) {
  await getTestEnv().withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "events", id), eventFields(overrides));
  });
}

/** Exactly the query the homepage runs. */
function homepageQuery(db: Firestore) {
  return query(
    collection(db, "events"),
    where("status", "==", "published"),
    where("date", ">=", Timestamp.fromDate(startOfToday())),
    orderBy("date", "asc"),
    limit(3),
  );
}

describe("events collection", () => {
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

  it("creates an event as an admin", async () => {
    await assertSucceeds(
      addDoc(collection(authAs("admin-uid"), "events"), eventFields()),
    );
  });

  it("rejects an event create from an unauthenticated visitor", async () => {
    await assertFails(
      addDoc(collection(anonDb(), "events"), eventFields()),
    );
  });

  it("lets an unauthenticated visitor run the homepage query", async () => {
    await seedEvent("published-1");

    await assertSucceeds(getDocs(homepageQuery(anonDb())));

    const snap = await getDocs(homepageQuery(anonDb()));
    expect(snap.size).toBe(1);
    expect(snap.docs[0].data().title).toBe("Ward Meeting");
  });

  it("denies an unauthenticated read of a draft event", async () => {
    await seedEvent("draft-1", { status: "draft" });

    await assertFails(getDoc(doc(anonDb(), "events", "draft-1")));
  });

  it("keeps drafts out of the homepage query", async () => {
    await seedEvent("published-1");
    await seedEvent("draft-1", { status: "draft" });

    const snap = await getDocs(homepageQuery(anonDb()));

    expect(snap.docs.map((d) => d.id)).toEqual(["published-1"]);
  });

  it("returns at most three upcoming published events, ascending", async () => {
    await seedEvent("past-1", { date: dayOffset(-2) });
    await seedEvent("future-1", { date: dayOffset(1) });
    await seedEvent("future-2", { date: dayOffset(2) });
    await seedEvent("future-3", { date: dayOffset(3) });
    await seedEvent("future-4", { date: dayOffset(4) });

    const snap = await getDocs(homepageQuery(anonDb()));
    const ids = snap.docs.map((d) => d.id);

    expect(ids).toEqual(["future-1", "future-2", "future-3"]);

    const millis = snap.docs.map((d) => (d.data().date as Timestamp).toMillis());
    expect(millis[0]).toBeLessThan(millis[1]);
    expect(millis[1]).toBeLessThan(millis[2]);
  });

  it("excludes a past-dated published event from the upcoming list", async () => {
    await seedEvent("past-1", { date: dayOffset(-2) });

    await assertSucceeds(getDocs(homepageQuery(anonDb())));

    const snap = await getDocs(homepageQuery(anonDb()));
    expect(snap.size).toBe(0);
  });

  it("an event keeps the LGA and ward the admin selected", async () => {
    await addDoc(
      collection(authAs("admin-uid"), "events"),
      eventFields({ lga_id: "nsukka", ward_id: "nsukka-ward-01" }),
    );

    const snap = await getDocs(homepageQuery(anonDb()));
    const data = snap.docs[0].data();

    expect(data.lga_id).toBe("nsukka");
    expect(data.ward_id).toBe("nsukka-ward-01");
  });
});
