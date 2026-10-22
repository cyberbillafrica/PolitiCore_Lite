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
  setDoc,
  serverTimestamp,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { auth, db, firebaseConfig } from "./config";
import {
  ensureBaselineCampaignProjection,
  syncCampaignAccessForUser,
} from "./userAccess";

import type { MembershipType, Role } from "@/types";

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

    await setDoc(doc(db, "users", user.uid), {
      ...cleanedUserData,

      email,

      /**
       * Everyone registering through the public
       * registration form starts as a normal member.
       */
      access_role: "member",

      /**
       * Social ranking starts at zero.
       */
      points: 0,
      rank: "Volunteer",

      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    /*
     * Baseline projection.
     *
     * Without it a brand-new plain campaign member has ZERO
     * `user_access` documents, so every campaign read gated on
     * `hasAccess()` is denied and the portal shows "Missing or
     * insufficient permissions". Failures are logged inside the helper
     * and never block the signup.
     */
    await ensureBaselineCampaignProjection(user.uid, {
      profile: {
        access_role: "member",
        membership_types: userData.membership_types ?? [],
        lga_id: userData.lga_id ?? null,
        ward_id: userData.ward_id ?? null,
        polling_unit_id: userData.polling_unit_id ?? null,
      },
    });

    return {
      user,
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

export const SUSPENSION_NOTICE_STORAGE_KEY =
  "politicore.auth.suspendedNotice";

/** Flag the one-time suspension notice for the login screen. */
export function flagSuspensionNotice(): void {
  try {
    window.sessionStorage.setItem(SUSPENSION_NOTICE_STORAGE_KEY, "1");
  } catch {
    /* Storage unavailable — the notice simply is not shown. */
  }
}

/** Consume the one-time suspension notice (called by the login page). */
export function consumeSuspensionNotice(): boolean {
  try {
    if (window.sessionStorage.getItem(SUSPENSION_NOTICE_STORAGE_KEY)) {
      window.sessionStorage.removeItem(SUSPENSION_NOTICE_STORAGE_KEY);
      return true;
    }
  } catch {
    /* Storage unavailable. */
  }
  return false;
}

/*
 * Live watch on the caller's own /users/{uid} document. The rules
 * keep own-profile reads allowed precisely so this check can run
 * and sign the member out.
 */
export function subscribeToUserStatus(
  userId: string,
  onSuspended: () => void,
): Unsubscribe {
  return onSnapshot(doc(db, "users", userId), (snapshot) => {
    const data = snapshot.data() as { status?: string } | undefined;

    if (data?.status === "suspended") {
      onSuspended();
    }
  });
}

export function onAuthStateChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

