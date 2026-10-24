import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { anonDb, authAs, seedUser } from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

/*
 * ============================================================
 * NOTIFICATION INBOX RULES
 * ============================================================
 *
 * A notification is a per-user row with FAN-OUT writes: the actor's
 * session writes it into somebody else's inbox. The rules therefore
 * separate "who may create" (any signed-in actor, for a valid event)
 * from "who may read" (the owner only, plus admin).
 */

function notification(input: {
  user_id: string;
  actor_id: string;
  type?: string;
  read?: boolean;
  title?: string;
}) {
  return {
    user_id: input.user_id,
    actor_id: input.actor_id,
    type: input.type ?? "assignment_created",
    title: input.title ?? "New assignment: Mobilise the ward",
    message: "Campaign work has been assigned to you.",
    link: "/portal/campaign/assignments",
    entity_type: "campaign_assignment",
    entity_id: "assignment-1",
    read: input.read ?? false,
    created_at: serverTimestamp(),
  };
}

async function seedNotification(input: {
  id: string;
  user_id: string;
  actor_id?: string;
}): Promise<void> {
  await getTestEnv().withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();

    await setDoc(doc(database, "notifications", input.id), {
      user_id: input.user_id,
      actor_id: input.actor_id ?? "admin",
      type: "assignment_created",
      title: "Seeded notification",
      message: "Seed",
      link: "/portal/campaign/assignments",
      entity_type: "campaign_assignment",
      entity_id: "assignment-1",
      read: false,
      created_at: new Date(),
      read_at: null,
    });
  });
}

describe("notifications", () => {
  beforeAll(async () => {
    await initTestEnv();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  beforeEach(async () => {
    await clearDb();

    await seedUser("chika");
    await seedUser("ifeanyi");
    await seedUser("admin", { access_role: "admin" });

    await seedNotification({ id: "n-chika", user_id: "chika" });
  });

  it("the owner reads their own inbox", async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(authAs("chika"), "notifications"),
          where("user_id", "==", "chika"),
          orderBy("created_at", "desc"),
        ),
      ),
    );
  });

  it("another member cannot read the owner's inbox", async () => {
    await assertFails(
      getDocs(
        query(
          collection(authAs("ifeanyi"), "notifications"),
          where("user_id", "==", "chika"),
        ),
      ),
    );
  });

  it("an admin reads any inbox", async () => {
    await assertSucceeds(
      getDocs(collection(authAs("admin"), "notifications")),
    );
  });

  it("the owner marks a notification read", async () => {
    await assertSucceeds(
      updateDoc(doc(authAs("chika"), "notifications", "n-chika"), {
        read: true,
        read_at: serverTimestamp(),
      }),
    );
  });

  it("the owner cannot rewrite anything but read state", async () => {
    await assertFails(
      updateDoc(doc(authAs("chika"), "notifications", "n-chika"), {
        read: true,
        read_at: serverTimestamp(),
        title: "Rewritten",
      }),
    );
  });

  it("another member cannot mark someone else's notification read", async () => {
    await assertFails(
      updateDoc(doc(authAs("ifeanyi"), "notifications", "n-chika"), {
        read: true,
        read_at: serverTimestamp(),
      }),
    );
  });

  it("a signed-in actor fans out into another member's inbox", async () => {
    await assertSucceeds(
      addDoc(
        collection(authAs("ifeanyi"), "notifications"),
        notification({ user_id: "chika", actor_id: "ifeanyi" }),
      ),
    );
  });

  it("a create attributed to somebody else is rejected", async () => {
    await assertFails(
      addDoc(
        collection(authAs("ifeanyi"), "notifications"),
        notification({ user_id: "chika", actor_id: "chika" }),
      ),
    );
  });

  it("an unknown event type is rejected", async () => {
    await assertFails(
      addDoc(
        collection(authAs("ifeanyi"), "notifications"),
        notification({
          user_id: "chika",
          actor_id: "ifeanyi",
          type: "made_up_event",
        }),
      ),
    );
  });

  it("a create that arrives already read is rejected", async () => {
    await assertFails(
      addDoc(
        collection(authAs("ifeanyi"), "notifications"),
        notification({ user_id: "chika", actor_id: "ifeanyi", read: true }),
      ),
    );
  });

  it("the owner cannot delete a notification", async () => {
    await assertFails(
      deleteDoc(doc(authAs("chika"), "notifications", "n-chika")),
    );
  });

  it("an admin may clean up a notification", async () => {
    await assertSucceeds(
      deleteDoc(doc(authAs("admin"), "notifications", "n-chika")),
    );
  });

  it("a create with a client timestamp is rejected", async () => {
    await assertFails(
      addDoc(collection(authAs("ifeanyi"), "notifications"), {
        ...notification({ user_id: "chika", actor_id: "ifeanyi" }),
        created_at: new Date(),
      }),
    );
  });

  it("a signed-out client reads nothing", async () => {
    await assertFails(getDocs(collection(anonDb(), "notifications")));
  });
});
