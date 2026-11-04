import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getAuth as getAdminAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";

import { auth, db } from "@/lib/firebase/config";
import {
  isSignupInProgress,
  shouldEjectForAccountStatus,
  signUpVolunteer,
} from "@/lib/firebase/auth";

import { INTEGRATION_PROJECT_ID } from "./env";

/*
 * ============================================================
 * SIGNUP FLOW — REAL CLIENT, REAL RULES (Round 17A)
 * ============================================================
 *
 * These tests call `signUpVolunteer()` itself. They deliberately do NOT use
 * `testEnv.authenticatedContext()`: the rules suite fakes the caller and
 * writes synthetic payloads, which is exactly why it could not catch a
 * broken client flow.
 */

let adminApp: App;
let adminDb: Firestore;
let adminAuth: Auth;

const VALID_DATA = {
  full_name: "Integration Volunteer",
  phone: "08000000000",
  gender: "male",
  membership_types: ["campaign_member" as const],
  lga_id: "nkanu-west",
  ward_id: "nkanu-west-ward-01",
  polling_unit_id: "nkanu-west-ward-01-pu-001",
};

const RESULT_DOC = {
  contest_id: "contest-1",
  ward_id: VALID_DATA.ward_id,
  polling_unit_id: VALID_DATA.polling_unit_id,
  lga_id: VALID_DATA.lga_id,
  state_id: "enugu",
  submitted_by: "someone-else",
  results: [{ party: "APC", votes: 10 }],
  status: "approved",
  verified: true,
};

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Create an approved admin and return its uid. */
async function seedAdmin(): Promise<string> {
  const record = await adminAuth.createUser({
    email: uniqueEmail("admin"),
    password: "secret123",
  });

  await adminDb.doc(`users/${record.uid}`).set({
    full_name: "Integration Admin",
    email: record.email,
    access_role: "admin",
    status: "active",
    membership_types: ["campaign_member"],
    ward_id: VALID_DATA.ward_id,
    polling_unit_id: VALID_DATA.polling_unit_id,
    created_at: new Date(),
  });

  return record.uid;
}

async function clearCollections(): Promise<void> {
  for (const name of ["users", "user_access", "notifications", "election_results"]) {
    const snapshot = await adminDb.collection(name).get();

    await Promise.all(snapshot.docs.map((item) => item.ref.delete()));
  }

  const listing = await adminAuth.listUsers(1000);

  await Promise.all(
    listing.users.map((user) =>
      adminAuth.deleteUser(user.uid).catch(() => undefined),
    ),
  );
}

async function signInAs(uid: string): Promise<void> {
  const record = await adminAuth.getUser(uid);

  await signInWithEmailAndPassword(auth, record.email!, "secret123");
}

beforeAll(async () => {
  adminApp = initializeApp({ projectId: INTEGRATION_PROJECT_ID }, "integration-test");
  adminDb = getFirestore(adminApp);
  adminAuth = getAdminAuth(adminApp);

  /*
   * Absorb the Admin SDK's one-time credential resolution here, under the
   * 90s hook timeout, instead of inside the first test (45s). On a machine
   * without GCP credentials the initial token resolution can take ~30s.
   */
  await adminAuth.listUsers(1).catch(() => undefined);
  await adminDb.doc("warm-up/credentials").get().catch(() => undefined);
});

afterAll(async () => {
  await deleteApp(adminApp).catch(() => undefined);
});

beforeEach(async () => {
  await signOut(auth).catch(() => undefined);
  await clearCollections();
});

describe("signUpVolunteer", () => {
  it("creates a pending profile, no campaign grants, and notifies admins", async () => {
    const adminUid = await seedAdmin();

    const result = await signUpVolunteer(uniqueEmail("signup"), "secret123", VALID_DATA);

    expect(result.error).toBeNull();
    expect(result.user?.uid).toBeTruthy();

    const uid = result.user!.uid;
    const profile = await adminDb.doc(`users/${uid}`).get();

    expect(profile.exists).toBe(true);
    expect(profile.data()?.status).toBe("pending");
    expect(profile.data()?.access_role).toBe("member");
    expect(profile.data()?.points).toBe(0);

    /* No projection at signup — approval writes the baseline. */
    const grants = await adminDb
      .collection("user_access")
      .where("user_id", "==", uid)
      .get();

    expect(grants.size).toBe(0);

    const notes = await adminDb
      .collection("notifications")
      .where("type", "==", "registration_pending")
      .get();

    expect(notes.size).toBe(1);
    expect(notes.docs[0].data().user_id).toBe(adminUid);
    expect(notes.docs[0].data().link).toBe("/portal/admin/registrations");
  });

  it("signs the applicant out and leaves the pending status on the profile", async () => {
    await seedAdmin();

    const result = await signUpVolunteer(uniqueEmail("signed-out"), "secret123", VALID_DATA);

    expect(result.error).toBeNull();
    expect(auth.currentUser).toBeNull();

    /* The SDK can sign them in; `pending` is what blocks the portal. */
    await signInAs(result.user!.uid);

    const profile = await getDoc(doc(db, "users", result.user!.uid));

    expect(profile.data()?.status).toBe("pending");
  });

  it("survives the app's own pending gate while it writes the profile", async () => {
    await seedAdmin();

    /*
     * Round 17B regression. AuthContext watches the signed-in user's profile
     * and signs out any blocked status. Firestore echoes the signup write to
     * the local cache BEFORE the server acknowledges it, so that watcher used
     * to eject the applicant mid-write: the write was aborted, `users/{uid}`
     * never landed, admins were never notified, and the form reported a
     * failure for an account that existed.
     *
     * This reproduces the watcher with the same predicate the app uses, so
     * the two halves of the interaction are exercised together.
     */
    let stopProfile: () => void = () => undefined;

    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfile();
      stopProfile = () => undefined;

      if (!user) return;

      stopProfile = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
        const status = (snapshot.data()?.status as string | undefined) ?? null;

        if (shouldEjectForAccountStatus(status)) {
          void signOut(auth);
        }
      });
    });

    try {
      const pending = signUpVolunteer(
        uniqueEmail("gate"),
        "secret123",
        VALID_DATA,
      );

      /* The signup owns the session from the moment it starts. */
      expect(isSignupInProgress()).toBe(true);
      expect(shouldEjectForAccountStatus("pending")).toBe(false);

      const result = await pending;

      expect(result.error).toBeNull();
      expect(isSignupInProgress()).toBe(false);

      const profile = await adminDb.doc(`users/${result.user!.uid}`).get();

      expect(profile.exists).toBe(true);
      expect(profile.data()?.status).toBe("pending");

      /* Outside the signup window the gate is unchanged. */
      expect(shouldEjectForAccountStatus("pending")).toBe(true);
      expect(shouldEjectForAccountStatus("active")).toBe(false);
      expect(shouldEjectForAccountStatus(undefined)).toBe(false);
    } finally {
      stopProfile();
      stopAuth();
    }
  });

  it("rejects invalid input before any account is created", async () => {
    const adminUid = await seedAdmin();
    const email = uniqueEmail("invalid");

    /*
     * Deliberately incomplete: the runtime validation is what must reject
     * this, so the missing field is removed after the type is fixed rather
     * than widening the function's contract.
     */
    const withoutWard: Partial<typeof VALID_DATA> = { ...VALID_DATA };
    delete withoutWard.ward_id;

    const result = await signUpVolunteer(
      email,
      "secret123",
      withoutWard as typeof VALID_DATA,
    );

    expect(result.user).toBeNull();
    expect(result.error).toMatch(/ward/i);

    /* The important part: no orphan auth account was left behind. */
    await expect(adminAuth.getUserByEmail(email)).rejects.toThrow(/no user record/i);

    const notes = await adminDb
      .collection("notifications")
      .where("user_id", "==", adminUid)
      .get();

    expect(notes.size).toBe(0);
  });

  it("denies election results to a pending account", async () => {
    await seedAdmin();

    const result = await signUpVolunteer(
      uniqueEmail("pending-read"),
      "secret123",
      VALID_DATA,
    );

    expect(result.error).toBeNull();

    await adminDb.doc("election_results/result-1").set(RESULT_DOC);
    await signInAs(result.user!.uid);

    /*
     * `isActiveUser()` fails for a pending profile, so the read is refused.
     * The rules engine may report that as permission-denied or as an
     * evaluation error depending on which clause short-circuits; what
     * matters is that no document is returned.
     */
    await expect(
      getDoc(doc(db, "election_results", "result-1")),
    ).rejects.toThrow();
  });

  it("opens election results once the account is approved", async () => {
    await seedAdmin();

    const result = await signUpVolunteer(
      uniqueEmail("approved-read"),
      "secret123",
      VALID_DATA,
    );

    expect(result.error).toBeNull();

    const uid = result.user!.uid;

    await adminDb.doc("election_results/result-1").set(RESULT_DOC);
    await adminDb.doc(`users/${uid}`).update({ status: "active" });
    await signInAs(uid);

    const snapshot = await getDoc(doc(db, "election_results", "result-1"));

    expect(snapshot.data()).toBeDefined();
  });
});
