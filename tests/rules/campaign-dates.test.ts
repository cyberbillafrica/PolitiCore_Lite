import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  LGA,
  PU_001,
  STATE,
  WARD_01,
  ZONE,
  authAs,
  seedActivity,
  seedBaselineAccess,
  seedCoordinatorAccess,
  seedUser,
} from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

import {
  dateOnlyFromValue,
  dateOnlyToTimestamp,
  todayLocalDate,
} from "@/lib/campaign-dates";

/*
 * ============================================================
 * CAMPAIGN DATE FIELDS — ROUND 8 FIX 2C / FIX 3
 * ============================================================
 *
 * A user-set campaign date must be today or later, enforced by the
 * rules (the client's `<input min>` is the first line, not the only
 * one).
 *
 * The rules language cannot parse a "YYYY-MM-DD" string, so the stored
 * shape is a timestamp at LOCAL MIDNIGHT (`src/lib/campaign-dates.ts`).
 * "Today" is therefore 0-24h old and "yesterday" is at least 24h old —
 * exactly what the rule's one-day grace is meant to allow.
 */

function localDay(offsetDays: number): string {
  const now = new Date();
  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + offsetDays,
  );

  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

const yesterday = () => dateOnlyToTimestamp(localDay(-1));
const today = () => dateOnlyToTimestamp(localDay(0));
const tomorrow = () => dateOnlyToTimestamp(localDay(1));

function assignmentPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Deliver flyers",
    created_by: "pu-coord",
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    status: "open",
    completion_mode: "individual",
    priority: "medium",

    due_at: null,
    due_date: null,

    assigned_to_user: "member-uid",
    assigned_to_scope: null,
    assigned_to: "member-uid",
    assigned_by: "pu-coord",
    scope_type: "",
    scope_id: "",
    created_scope: { level: "polling_unit", scope_id: PU_001 },
    target_ward_id: null,

    ...overrides,
  };
}

function createAssignment(
  db: Firestore,
  overrides: Record<string, unknown> = {},
) {
  return addDoc(
    collection(db, "campaign_assignments"),
    assignmentPayload(overrides),
  );
}

function activityPayload(
  date: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    title: "Ward meeting",
    activity_type: "meeting",
    status: "scheduled",
    date,
    scope_type: "polling_unit",
    scope_id: PU_001,
    scope_chain: [STATE, ZONE, LGA, WARD_01, PU_001],
    scope_ward_id: WARD_01,
    visibility_ward_ids: [WARD_01],
    visibility_pu_ids: [PU_001],
    created_by: "pu-coord",
    organizer_id: "pu-coord",
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),

    ...overrides,
  };
}

function createActivity(
  db: Firestore,
  date: unknown,
  overrides: Record<string, unknown> = {},
) {
  return addDoc(
    collection(db, "campaign_activities"),
    activityPayload(date, overrides),
  );
}

describe("campaign date fields", () => {
  beforeAll(async () => {
    await initTestEnv();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  beforeEach(async () => {
    await clearDb();

    await seedUser("pu-coord", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedBaselineAccess("pu-coord", PU_001, WARD_01, LGA, ZONE);
    await seedCoordinatorAccess("pu-coord", "polling_unit", PU_001);

    await seedUser("member-uid", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedBaselineAccess("member-uid", PU_001, WARD_01, LGA, ZONE);

    await seedUser("admin", { access_role: "admin" });
  });

  describe("campaign_assignments due_date", () => {
    it("rejects yesterday", async () => {
      const db = authAs("pu-coord");

      await assertFails(
        createAssignment(db, {
          due_at: yesterday(),
          due_date: yesterday(),
        }),
      );
    });

    it("accepts today", async () => {
      const db = authAs("pu-coord");

      await assertSucceeds(
        createAssignment(db, { due_at: today(), due_date: today() }),
      );
    });

    it("accepts tomorrow", async () => {
      const db = authAs("pu-coord");

      await assertSucceeds(
        createAssignment(db, { due_at: tomorrow(), due_date: tomorrow() }),
      );
    });

    it("accepts an absent due date", async () => {
      const db = authAs("pu-coord");

      await assertSucceeds(
        createAssignment(db, { due_at: null, due_date: null }),
      );
    });

    it("rejects a date string, which the rules cannot validate", async () => {
      const db = authAs("pu-coord");

      await assertFails(
        createAssignment(db, {
          due_at: localDay(1),
          due_date: localDay(1),
        }),
      );
    });

    it("rejects moving an existing due date into the past", async () => {
      const db = authAs("pu-coord");

      const created = await createAssignment(db, {
        due_at: tomorrow(),
        due_date: tomorrow(),
      });

      await assertFails(
        updateDoc(doc(db, "campaign_assignments", created.id), {
          due_at: yesterday(),
          due_date: yesterday(),
          updated_at: serverTimestamp(),
        }),
      );
    });

    it("still allows an update that leaves the due date alone", async () => {
      const db = authAs("pu-coord");

      const created = await createAssignment(db, {
        due_at: tomorrow(),
        due_date: tomorrow(),
      });

      await assertSucceeds(
        updateDoc(doc(db, "campaign_assignments", created.id), {
          title: "Deliver flyers to the ward square",
          updated_at: serverTimestamp(),
        }),
      );
    });
  });

  describe("campaign_activities date", () => {
    it("rejects yesterday", async () => {
      const db = authAs("pu-coord");

      await assertFails(createActivity(db, yesterday()));
    });

    it("accepts today", async () => {
      const db = authAs("pu-coord");

      await assertSucceeds(createActivity(db, today()));
    });

    it("accepts tomorrow", async () => {
      const db = authAs("pu-coord");

      await assertSucceeds(createActivity(db, tomorrow()));
    });

    it("rejects a date string, which the rules cannot validate", async () => {
      const db = authAs("pu-coord");

      await assertFails(createActivity(db, localDay(1)));
    });

    it("rejects moving an existing date into the past", async () => {
      const db = authAs("admin");

      const id = await seedActivity({
        scope_type: "polling_unit",
        scope_id: PU_001,
        scope_ward_id: WARD_01,
        created_by: "pu-coord",
      });

      await assertFails(
        updateDoc(doc(db, "campaign_activities", id), {
          date: yesterday(),
          updated_at: serverTimestamp(),
        }),
      );
    });

    it("still allows an update to a legacy string-dated activity", async () => {
      /* Pre-Round-8 rows keep a string date and must remain editable. */
      const db = authAs("admin");

      const id = await seedActivity({
        scope_type: "ward",
        scope_id: WARD_01,
        scope_ward_id: WARD_01,
        created_by: "pu-coord",
      });

      await assertSucceeds(
        updateDoc(doc(db, "campaign_activities", id), {
          title: "Moved indoors",
          updated_at: serverTimestamp(),
        }),
      );
    });
  });

  describe("stored shape", () => {
    it("round-trips a date-only value through the timestamp at local midnight", () => {
      const value = localDay(3);
      const stored = dateOnlyToTimestamp(value);

      expect(stored).not.toBeNull();
      expect(dateOnlyFromValue(stored)).toBe(value);

      /* Local midnight, not UTC midnight. */
      const date = stored!.toDate();
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
    });

    it("formats today for the input min attribute", () => {
      expect(todayLocalDate(new Date(2026, 9, 23, 23, 30))).toBe("2026-10-23");
    });
  });
});
