import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getAuth as getAdminAuth, type Auth } from "firebase-admin/auth";

import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { auth } from "@/lib/firebase/config";
import {
  confirmNewPassword,
  MIN_PASSWORD_LENGTH,
  requestPasswordReset,
  validateNewPassword,
  verifyResetCode,
} from "@/lib/firebase/password-reset";

import { INTEGRATION_PROJECT_ID } from "./env";

/*
 * ============================================================
 * PASSWORD RESET — REAL CLIENT, REAL AUTH EMULATOR (Round 18)
 * ============================================================
 *
 * These tests call the same functions the /forgot-password and
 * /reset-password pages call, against the real Firebase Auth SDK and the
 * Auth emulator. Nothing is mocked.
 *
 * The oobCode is not something the client ever sees — Firebase emails it.
 * The emulator exposes the codes it generated at:
 *
 *   GET /emulator/v1/projects/{projectId}/oobCodes
 *
 * so each test can play the part of the person clicking the link.
 */

let adminApp: App;
let adminAuth: Auth;

const INITIAL_PASSWORD = "secret123";
const NEW_PASSWORD = "brandNewPass456";

const AUTH_EMULATOR = "http://127.0.0.1:9099";

interface EmulatorOobCode {
  email?: string;
  requestType?: string;
  oobCode?: string;
}

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function createUser(email: string): Promise<string> {
  const record = await adminAuth.createUser({
    email,
    password: INITIAL_PASSWORD,
  });

  return record.uid;
}

/**
 * The reset code the emulator "emailed" for this address.
 *
 * Firebase lower-cases addresses, so compare case-insensitively. The
 * endpoint is populated by the same call the app makes, but it is polled
 * briefly because the write and the response are not ordered for us.
 */
async function latestResetCode(email: string): Promise<string> {
  const target = email.toLowerCase();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(
      `${AUTH_EMULATOR}/emulator/v1/projects/${INTEGRATION_PROJECT_ID}/oobCodes`,
    );

    if (!response.ok) {
      throw new Error(`oobCodes request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      oobCodes?: EmulatorOobCode[];
    };

    const matches = (payload.oobCodes ?? []).filter(
      (item) =>
        item.email?.toLowerCase() === target &&
        item.requestType === "PASSWORD_RESET" &&
        typeof item.oobCode === "string",
    );

    if (matches.length > 0) {
      return matches[matches.length - 1].oobCode as string;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`No reset code was generated for ${email}`);
}

beforeAll(async () => {
  adminApp = initializeApp({ projectId: INTEGRATION_PROJECT_ID }, "reset-test");
  adminAuth = getAdminAuth(adminApp);

  /* Absorb first-call credential resolution under the hook timeout. */
  await adminAuth.listUsers(1).catch(() => undefined);
});

afterAll(async () => {
  await deleteApp(adminApp).catch(() => undefined);
});

beforeEach(async () => {
  await signOut(auth).catch(() => undefined);

  const listing = await adminAuth.listUsers(1000);

  await Promise.all(
    listing.users.map((user) =>
      adminAuth.deleteUser(user.uid).catch(() => undefined),
    ),
  );
});

describe("requestPasswordReset", () => {
  it("sends a reset email for an existing account", async () => {
    const email = uniqueEmail("reset-known");

    await createUser(email);

    const result = await requestPasswordReset(email);

    expect(result).toEqual({ ok: true });

    /* The emulator really did generate a code for it. */
    await expect(latestResetCode(email)).resolves.toBeTruthy();
  });

  it("hides whether an unknown address has an account", async () => {
    const email = uniqueEmail("reset-unknown");

    /*
     * The emulator has email enumeration protection disabled, so the SDK
     * really throws here. Production may behave differently — with
     * enumeration protection on, sendPasswordResetEmail resolves silently
     * for unknown addresses. Either way requestPasswordReset() must report
     * success, so the page cannot be used to probe for accounts.
     */
    await expect(sendPasswordResetEmail(auth, email)).rejects.toMatchObject({
      code: "auth/user-not-found",
    });

    const result = await requestPasswordReset(email);

    expect(result).toEqual({ ok: true });
  });

  it("rejects a malformed address before calling Firebase", async () => {
    await expect(requestPasswordReset("not-an-email")).resolves.toEqual({
      ok: false,
      failure: "invalid-email",
    });
  });
});

describe("verifyResetCode", () => {
  it("returns the account email for a code from the email", async () => {
    const email = uniqueEmail("reset-verify");

    await createUser(email);
    await requestPasswordReset(email);

    const code = await latestResetCode(email);
    const result = await verifyResetCode(code);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.email.toLowerCase()).toBe(email.toLowerCase());
    }
  });

  it("refuses an invalid code", async () => {
    const result = await verifyResetCode("invalid-code-xyz");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.failure).toBe("invalid");
    }
  });
});

describe("confirmNewPassword", () => {
  it("sets the new password and invalidates the old one", async () => {
    const email = uniqueEmail("reset-confirm");

    await createUser(email);
    await requestPasswordReset(email);

    const code = await latestResetCode(email);
    const result = await confirmNewPassword(code, NEW_PASSWORD);

    expect(result).toEqual({ ok: true });

    /* The new password works. */
    const session = await signInWithEmailAndPassword(auth, email, NEW_PASSWORD);

    expect(session.user.uid).toBeTruthy();

    await signOut(auth);

    /* The old one does not. */
    await expect(
      signInWithEmailAndPassword(auth, email, INITIAL_PASSWORD),
    ).rejects.toThrow();
  });

  it("rejects a code that was already used", async () => {
    const email = uniqueEmail("reset-reuse");

    await createUser(email);
    await requestPasswordReset(email);

    const code = await latestResetCode(email);

    await expect(confirmNewPassword(code, NEW_PASSWORD)).resolves.toEqual({
      ok: true,
    });

    const second = await confirmNewPassword(code, "anotherPass789");

    expect(second.ok).toBe(false);

    if (!second.ok) {
      expect(["expired", "invalid"]).toContain(second.failure);
    }

    /* The first reset stands: the old password still does not work. */
    await expect(
      signInWithEmailAndPassword(auth, email, INITIAL_PASSWORD),
    ).rejects.toThrow();
  });
});

/*
 * The form's inline validation. Pure, but it is the only thing standing
 * between a typo and a confusing Firebase error.
 */
describe("validateNewPassword", () => {
  it("requires a password of at least the minimum length", () => {
    expect(validateNewPassword("", "")).toBe("Enter a new password.");

    expect(
      validateNewPassword("a".repeat(MIN_PASSWORD_LENGTH - 1), "a".repeat(9)),
    ).toMatch(/at least/i);

    expect(validateNewPassword("a".repeat(MIN_PASSWORD_LENGTH), "a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("requires both entries to match", () => {
    expect(validateNewPassword(NEW_PASSWORD, "differentPass123")).toMatch(
      /match/i,
    );
  });
});
