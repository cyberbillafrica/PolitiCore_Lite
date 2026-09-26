import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";

import { initializeApp, deleteApp } from "firebase/app";
import { getAuth } from "firebase/auth";

import { doc, setDoc, serverTimestamp } from "firebase/firestore";

import { auth, db, firebaseConfig } from "./config";

import { CURRENT_TENANT_ID } from "./tenants";

import type { MembershipType, Role } from "@/types";

/**
 * Creates a new volunteer account through the public
 * registration form.
 *
 * Public registrations always belong to the current campaign
 * tenant and start with the normal "member" access role.
 */
export async function signUpVolunteer(
  email: string,
  password: string,
  userData: {
    full_name: string;
    phone: string;
    gender: string;

    membership_types: MembershipType[];

    ward_id: string;
    polling_unit_id: string;

    facebook_username?: string;
    x_username?: string;
    instagram_username?: string;
    tiktok_username?: string;
  },
) {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );

    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      ...userData,

      email,

      /**
       * All users belong to the current campaign tenant.
       */
      tenant_id: CURRENT_TENANT_ID,

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

    /**
     * Create the Firestore user profile through the
     * primary Firestore connection.
     *
     * tenant_id is explicitly assigned from the canonical
     * tenant constant rather than relying on the currently
     * logged-in admin's profile.
     */
    await setDoc(doc(db, "users", newUser.uid), {
      ...userData,

      email,

      /**
       * Canonical campaign tenant.
       */
      tenant_id: CURRENT_TENANT_ID,

      points: 0,
      rank: "Volunteer",

      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

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
export function onAuthStateChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

