import { describe, expect, it, vi } from "vitest";

import {
  SignupWriteError,
  settleWithin,
  validateSignupInput,
  writeWithCredentialRetry,
} from "@/lib/firebase/signup-profile-write";

/*
 * ============================================================
 * SIGNUP PROFILE WRITE (Round 17A)
 * ============================================================
 *
 * Pure policy tests. No emulator, no SDK.
 *
 * The first describe block is the regression test for the production bug:
 * a write issued before Firestore installs the new account's credential is
 * aborted by the stream reset and its promise NEVER settles. A signup that
 * waits on that promise hangs forever (the endless "Creating Account…"
 * spinner). The policy must notice the silence and retry.
 */

const noSleep = async () => {};

/** A promise that never settles — exactly what a dropped write looks like. */
function never<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

function permissionDenied(): Error {
  return Object.assign(new Error("Missing or insufficient permissions."), {
    code: "permission-denied",
  });
}

describe("writeWithCredentialRetry", () => {
  it("writes once when the credential is already installed", async () => {
    const write = vi.fn(async () => {});

    await writeWithCredentialRetry({
      write,
      waitForCredential: async () => true,
      sleep: noSleep,
    });

    expect(write).toHaveBeenCalledTimes(1);
  });

  it("retries a write that never settles instead of hanging forever", async () => {
    let attempts = 0;

    const write = vi.fn(async () => {
      attempts += 1;

      /* First attempt is dropped by the credential handoff. */
      if (attempts === 1) await never<void>();
    });

    await writeWithCredentialRetry({
      write,
      waitForCredential: async () => true,
      writeTimeoutMs: 20,
      sleep: noSleep,
    });

    expect(write).toHaveBeenCalledTimes(2);
  });

  it("does not write until the client is authenticated", async () => {
    const write = vi.fn(async () => {});
    let ready = false;

    const promise = writeWithCredentialRetry({
      write,
      waitForCredential: async () => {
        const current = ready;
        ready = true; // becomes available on the next attempt
        return current;
      },
      writeTimeoutMs: 50,
      sleep: noSleep,
    });

    await promise;

    expect(write).toHaveBeenCalledTimes(1);
  });

  it("fails with a user-facing error when the credential never arrives", async () => {
    const write = vi.fn(async () => {});

    await expect(
      writeWithCredentialRetry({
        write,
        waitForCredential: async () => false,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ reason: "credential-unavailable" });

    expect(write).not.toHaveBeenCalled();
  });

  it("retries permission-denied (the credential was not ready yet)", async () => {
    let attempts = 0;

    const write = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw permissionDenied();
    });

    await writeWithCredentialRetry({
      write,
      waitForCredential: async () => true,
      sleep: noSleep,
    });

    expect(write).toHaveBeenCalledTimes(2);
  });

  it("does not retry a write that is genuinely invalid", async () => {
    const error = Object.assign(new Error("Unsupported field value"), {
      code: "invalid-argument",
    });

    const write = vi.fn(async () => {
      throw error;
    });

    await expect(
      writeWithCredentialRetry({
        write,
        waitForCredential: async () => true,
        sleep: noSleep,
      }),
    ).rejects.toBe(error);

    expect(write).toHaveBeenCalledTimes(1);
  });

  it("reports a timeout when every attempt goes unanswered", async () => {
    const write = vi.fn(() => never<void>());

    const failure = writeWithCredentialRetry({
      write,
      waitForCredential: async () => true,
      attempts: 2,
      writeTimeoutMs: 10,
      sleep: noSleep,
    });

    await expect(failure).rejects.toBeInstanceOf(SignupWriteError);
    await expect(failure).rejects.toMatchObject({ reason: "write-timeout" });

    expect(write).toHaveBeenCalledTimes(2);
  });
});

describe("settleWithin", () => {
  it("reports a fulfilled value", async () => {
    await expect(settleWithin(Promise.resolve("ok"), 50)).resolves.toEqual({
      status: "fulfilled",
      value: "ok",
    });
  });

  it("reports a rejection", async () => {
    const reason = new Error("boom");

    await expect(settleWithin(Promise.reject(reason), 50)).resolves.toEqual({
      status: "rejected",
      reason,
    });
  });

  it("reports a timeout for a promise that never settles", async () => {
    await expect(settleWithin(never<void>(), 10)).resolves.toEqual({
      status: "timeout",
    });
  });
});

describe("validateSignupInput", () => {
  const valid = {
    email: "someone@example.com",
    password: "secret123",
    userData: {
      full_name: "Full Name",
      phone: "08000000000",
      gender: "male",
      ward_id: "nkanu-west-ward-01",
      polling_unit_id: "nkanu-west-ward-01-pu-001",
      membership_types: ["campaign_member"],
    },
  };

  it("accepts a complete registration", () => {
    expect(validateSignupInput(valid)).toBeNull();
  });

  it("rejects a missing ward before an account is created", () => {
    expect(
      validateSignupInput({
        ...valid,
        userData: { ...valid.userData, ward_id: "" },
      }),
    ).toMatch(/ward/i);
  });

  it("rejects a missing polling unit", () => {
    expect(
      validateSignupInput({
        ...valid,
        userData: { ...valid.userData, polling_unit_id: "   " },
      }),
    ).toMatch(/polling unit/i);
  });

  it("rejects an empty membership selection", () => {
    expect(
      validateSignupInput({
        ...valid,
        userData: { ...valid.userData, membership_types: [] },
      }),
    ).toMatch(/membership/i);
  });

  it("rejects a short password", () => {
    expect(validateSignupInput({ ...valid, password: "123" })).toMatch(/6 characters/i);
  });

  it("rejects a malformed email", () => {
    expect(validateSignupInput({ ...valid, email: "not-an-email" })).toMatch(/email/i);
  });
});
