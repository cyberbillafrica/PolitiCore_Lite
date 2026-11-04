import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";

import { initializeApp, deleteApp } from "firebase/app";
import { getAuth } from "firebase/auth";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { auth, db, firebaseConfig } from "./config";
import { syncCampaignAccessForUser } from "./userAccess";
import { notifyAdminsOfRegistration } from "./registrations";
import {
  settleWithin,
  validateSignupInput,
  writeWithCredentialRetry,
} from "./signup-profile-write";

import type { MembershipType, Role } from "@/types";

/**
 * Whether the Firestore client can authenticate requests for `uid` yet.
 *
 * A read of the caller's own profile is the cheapest probe: the rule is
 * `allow read: if isSignedIn()`, so `permission-denied` means the freshly
 * created credential has not been installed on the client yet. A probe
 * that never answers counts as "not ready" too.
 */
async function firestoreCredentialReady(
  uid: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const outcome = await settleWithin(getDoc(doc(db, "users", uid)), 3_000);

    if (outcome.status === "fulfilled") return true;

    const code =
      outcome.status === "rejected"
        ? (outcome.reason as { code?: string } | null)?.code
        : null;

    if (outcome.status === "rejected" && code !== "permission-denied") {
      return false;
    }

    if (Date.now() >= deadline) return false;

    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/**
 * Creates a new volunteer account through the public
 * registration form.
 *
 * Public registrations always start with the normal "member"
 * access role.
 */
export async function signUpVolunteer(
  email: string,
  password: string,
  userData: {
    full_name: string;
    phone: string;
    gender: string;

    membership_types: MembershipType[];

    lga_id?: string;
    ward_id: string;
    polling_unit_id: string;

    facebook_name?: string;
    facebook_profile_url?: string;
    x_name?: string;
    x_profile_url?: string;
    instagram_name?: string;
    instagram_profile_url?: string;
    tiktok_name?: string;
    tiktok_profile_url?: string;
  },
) {
  try {
    /*
     * Round 17A — validate before the account exists. An account created
     * for data we refuse to store is an auth user with no profile, and
     * nothing later in the flow can recover it.
     */
    const validationError = validateSignupInput({ email, password, userData });

    if (validationError) {
      return { user: null, error: validationError };
    }

    /*
     * From here until the account is signed out, a `pending` status belongs
     * to this signup and must not eject the session (see
     * `shouldEjectForAccountStatus`).
     */
    signupInProgress = true;

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );

    const user = userCredential.user;

    /*
     * Filter out undefined fields — Firestore rejects undefined
     * values, so dropped optional fields must be omitted entirely,
     * not written as undefined.
     */
    const cleanedUserData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(userData)) {
      if (value !== undefined) {
        cleanedUserData[key] = value;
      }
    }

    /*
     * Round 17A — do not race the credential.
     *
     * `createUserWithEmailAndPassword` resolves as soon as the account and
     * its token exist. Firestore installs that credential on its own client
     * asynchronously. A write issued before that goes out unauthenticated:
     * the server denies it and the stream reset for the new credential
     * aborts the in-flight request, so the promise never settles. Production
     * produced auth accounts with no profile and a spinner that never
     * stopped.
     *
     * Waiting for the auth state, then for an authenticated read to succeed,
     * guarantees the write leaves on an authenticated client. The bounded
     * retry below covers the residual timing window and turns a dropped
     * write into a real error instead of a hung form.
     */
    await auth.authStateReady().catch(() => {});

    await writeWithCredentialRetry({
      waitForCredential: () => firestoreCredentialReady(user.uid),

      write: () =>
        setDoc(doc(db, "users", user.uid), {
          ...cleanedUserData,

          email,

          /**
           * Everyone registering through the public
           * registration form starts as a normal member.
           */
          access_role: "member",

          /**
           * Round 17 — a public signup is NOT usable until an admin
           * approves it. The account is created (so the profile and the
           * decision survive) but every portal surface and every rule gate
           * treats `pending` as blocked.
           *
           * Admin-created members skip this: createMemberByAdmin() writes
           * an account the admin is already vouching for.
           */
          status: "pending",

          /**
           * Social ranking starts at zero.
           */
          points: 0,
          rank: "Volunteer",

          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        }),
    });

    /*
     * Round 17 — NO campaign projection at signup.
     *
     * Campaign reads are gated on `hasAccess()` (the `user_access`
     * index), not on `isActiveUser()`. Writing the baseline here would
     * therefore let a pending registration read its ward's activities
     * and assignments through the SDK even though the app refuses to
     * sign it in. The 9 baseline documents are written by the APPROVAL
     * batch instead (see `approveRegistration` in ./userAccess), so a
     * pending account has no grants at all and `hasAccess()` denies it
     * naturally.
     */

    /*
     * Tell the admins. This runs while the new account's session still
     * exists (the notification rule requires actor_id == uid), and it
     * never blocks the signup.
     */
    await notifyAdminsOfRegistration({
      userId: user.uid,
      fullName: userData.full_name,
      wardId: userData.ward_id,
    });

    /*
     * Round 17 — do not leave a pending account signed in.
     *
     * `createUserWithEmailAndPassword` authenticates on the primary
     * instance, so without this the applicant would already hold a
     * session while the UI says "awaiting approval". Signing out here
     * also means the AuthContext status check never has to bounce them.
     *
     * A failed sign-out is not a failed registration: the account exists
     * and the `pending` status still ejects the session on the next
     * auth-state check.
     */
    await signOut(auth).catch(() => {});

    return {
      user,
      error: null,
    };
  } catch (error: any) {
    return {
      user: null,
      error: error.message,
    };
  } finally {
    signupInProgress = false;
  }
}

/**
 * Creates a new member account on behalf of an admin.
 *
 * IMPORTANT:
 *
 * createUserWithEmailAndPassword on the primary Firebase Auth
 * instance would replace the currently authenticated admin
 * session with the newly created user.
 *
 * Therefore this function creates the new account through a
 * temporary secondary Firebase App instance.
 *
 * The admin's primary authentication session is never replaced.
 *
 * NOTE:
 *
 * Authorization must still be enforced by Firestore Security
 * Rules / trusted backend logic. Client-side role checks alone
 * are not sufficient security.
 */
export async function createMemberByAdmin(
  email: string,
  password: string,
  userData: {
    full_name: string;
    phone: string;
    gender?: string;

    membership_types: MembershipType[];
    access_role: Role;

    lga_id?: string;
    ward_id: string;
    polling_unit_id: string;

    facebook_username?: string;
    x_username?: string;
    instagram_username?: string;
    tiktok_username?: string;
  },
) {
  const secondaryAppName = `admin-create-member-${Date.now()}`;

  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);

  const secondaryAuth = getAuth(secondaryApp);

  try {
    /**
     * Create the Firebase Authentication account
     * using the isolated secondary Auth instance.
     */
    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password,
    );

    const newUser = userCredential.user;

    /*
     * Filter out undefined fields — Firestore rejects undefined
     * values, so dropped optional fields must be omitted entirely,
     * not written as undefined.
     */
    const cleanedUserData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(userData)) {
      if (value !== undefined) {
        cleanedUserData[key] = value;
      }
    }

    /**
     * Create the Firestore user profile through the
     * primary Firestore connection.
     */
    await setDoc(doc(db, "users", newUser.uid), {
      ...cleanedUserData,

      email,

      points: 0,
      rank: "Volunteer",

      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    /*
     * Full projection (baseline + any coordinator grants): the admin is
     * the acting user here, so the `user_access` writes pass the rules.
     */
    await syncCampaignAccessForUser(newUser.uid);

    /**
     * Sign out of the secondary Auth instance so the
     * newly created account does not remain authenticated
     * on the temporary instance.
     */
    await secondaryAuth.signOut();

    return {
      user: newUser,
      error: null,
    };
  } catch (error: any) {
    return {
      user: null,
      error: error.message,
    };
  } finally {
    /**
     * Always destroy the temporary Firebase App instance.
     */
    await deleteApp(secondaryApp).catch(() => {});
  }
}

/**
 * Signs an existing user in.
 */
export async function signIn(email: string, password: string) {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );

    return {
      user: userCredential.user,
      error: null,
    };
  } catch (error: any) {
    return {
      user: null,
      error: error.message,
    };
  }
}

/**
 * Signs the current user out.
 */
export async function logOut() {
  try {
    await signOut(auth);

    return {
      error: null,
    };
  } catch (error: any) {
    return {
      error: error.message,
    };
  }
}

/**
 * Subscribes to Firebase authentication state changes.
 */
/*
 * ============================================================
 * MEMBER SUSPENSION ENFORCEMENT
 * ============================================================
 *
 * Firebase Auth sign-in can succeed for a suspended member — the
 * app's job is to detect the suspension and kick the member out.
 * Detection happens twice:
 *
 *   1. At sign-in: AuthContext reads the profile and signs out
 *      immediately when status === "suspended".
 *   2. Mid-session: subscribeToUserStatus() watches the caller's
 *      own /users/{uid} document and ejects them the moment an
 *      admin suspends them.
 *
 * Both paths leave a one-time notice for the login screen:
 * "Your account has been suspended. Please contact an
 * administrator."
 */

/**
 * Statuses that must not hold a session. Round 17 adds the two
 * registration states to the Round 6 suspension state.
 */
export type BlockedAccountStatus = "pending" | "rejected" | "suspended";

/** One-time, per-tab notice left for the login screen. */
export const ACCOUNT_NOTICE_STORAGE_KEY = "politicore.auth.accountNotice";

/** Legacy alias (suspension-only name, same key). */
export const SUSPENSION_NOTICE_STORAGE_KEY = ACCOUNT_NOTICE_STORAGE_KEY;

export function isBlockedAccountStatus(
  value: unknown,
): value is BlockedAccountStatus {
  return value === "pending" || value === "rejected" || value === "suspended";
}

/*
 * Round 17B — the registration gate must not fire on its own signup.
 *
 * `signUpVolunteer` writes a pending profile, and Firestore echoes that
 * write to the local cache immediately, long before the server acknowledges
 * it. AuthContext watches the same document, so it saw a pending account,
 * signed the applicant out mid-write, and the dropped stream aborted the
 * write: auth account created, `users/{uid}` never saved, admins never
 * notified. Every production signup failed this way while the emulator
 * tests passed, because those call `signUpVolunteer` without AuthContext.
 *
 * The flag below marks the window in which the pending status is the RESULT
 * of the signup we are performing, not a login attempt. Outside that window
 * a pending account is ejected exactly as before.
 */
let signupInProgress = false;

/** True while `signUpVolunteer` owns the freshly created session. */
export function isSignupInProgress(): boolean {
  return signupInProgress;
}

/**
 * Should the app reject this account status right now?
 *
 * Blocked statuses eject the session — except while the signup that is
 * creating this very account is still running.
 */
export function shouldEjectForAccountStatus(
  value: unknown,
): value is BlockedAccountStatus {
  return !signupInProgress && isBlockedAccountStatus(value);
}

/** The message the login screen shows for a blocked account. */
export function blockedAccountMessage(status: BlockedAccountStatus): string {
  switch (status) {
    case "pending":
      return "Your registration is pending admin approval. You\u2019ll be able to log in once approved.";

    case "rejected":
      return "Your registration was declined. Please contact the campaign team for more information.";

    default:
      return "Your account has been suspended. Please contact an administrator.";
  }
}

/** Flag the one-time notice for the login screen. */
export function flagAccountNotice(status: BlockedAccountStatus): void {
  try {
    window.sessionStorage.setItem(ACCOUNT_NOTICE_STORAGE_KEY, status);
  } catch {
    /* Storage unavailable — the notice simply is not shown. */
  }
}

/** Consume the one-time notice (called by the login page). */
export function consumeAccountNotice(): BlockedAccountStatus | null {
  try {
    const value = window.sessionStorage.getItem(ACCOUNT_NOTICE_STORAGE_KEY);

    if (value) {
      window.sessionStorage.removeItem(ACCOUNT_NOTICE_STORAGE_KEY);
      return isBlockedAccountStatus(value) ? value : null;
    }
  } catch {
    /* Storage unavailable. */
  }

  return null;
}

/** @deprecated Use `flagAccountNotice("suspended")`. */
export function flagSuspensionNotice(): void {
  flagAccountNotice("suspended");
}

/** @deprecated Use `consumeAccountNotice()` and compare with "suspended". */
export function consumeSuspensionNotice(): boolean {
  return consumeAccountNotice() === "suspended";
}

/*
 * Live watch on the caller's own /users/{uid} document. The rules
 * keep own-profile reads allowed precisely so this check can run
 * and sign the member out.
 */
export function subscribeToUserStatus(
  userId: string,
  onStatusChange: (status: string | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, "users", userId), (snapshot) => {
    const data = snapshot.data() as { status?: string } | undefined;

    onStatusChange(typeof data?.status === "string" ? data.status : null);
  });
}

export function onAuthStateChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

