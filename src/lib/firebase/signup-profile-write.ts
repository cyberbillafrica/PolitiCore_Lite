/*
 * ============================================================
 * SIGNUP PROFILE WRITE (Round 17A)
 * ============================================================
 *
 * Creating the account and installing its credential in the Firestore
 * client are two separate steps. The second one is asynchronous, and a
 * write issued in between goes out unauthenticated: the server denies
 * it, and when the client resets its streams for the new credential the
 * in-flight request is aborted. The `setDoc` promise then never settles
 * at all — which is exactly the production failure this module exists
 * to prevent: an endless "Creating Account…" spinner, an auth account
 * that exists, and no `users/{uid}` document.
 *
 * The policy here is deliberately SDK-free and dependency-injected:
 *
 *   1. wait until the client is actually authenticated for the new user,
 *   2. write under a deadline,
 *   3. retry a bounded number of times when the attempt was merely
 *      "not ready yet" (permission-denied / aborted / unavailable) or
 *      never answered,
 *   4. fail with a user-facing error instead of hanging forever.
 *
 * Every retry writes the same document with the same payload, so it is
 * idempotent.
 */

/* ============================================================
 * INPUT VALIDATION
 * ============================================================ */

/**
 * Fields the signup needs before an account may be created.
 *
 * Validation happens BEFORE `createUserWithEmailAndPassword`, because an
 * account created for data we then refuse to store is exactly the orphan
 * (`auth` user, no profile) this round is cleaning up.
 */
export interface SignupInput {
  full_name?: string;
  phone?: string;
  gender?: string;
  ward_id?: string;
  polling_unit_id?: string;
  membership_types?: string[];
}

const REQUIRED_TEXT_FIELDS: Array<[keyof SignupInput, string]> = [
  ["full_name", "full name"],
  ["phone", "phone number"],
  ["gender", "gender"],
  ["ward_id", "ward"],
  ["polling_unit_id", "polling unit"],
];

/**
 * Return a user-facing message for the first missing requirement, or null
 * when the input is complete enough to create an account.
 */
export function validateSignupInput(input: {
  email?: string;
  password?: string;
  userData: SignupInput;
}): string | null {
  const email = (input.email ?? "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Please enter a valid email address.";
  }

  if ((input.password ?? "").length < 6) {
    return "Password must be at least 6 characters.";
  }

  for (const [field, label] of REQUIRED_TEXT_FIELDS) {
    const value = input.userData[field];

    if (typeof value !== "string" || value.trim().length === 0) {
      return `Please provide your ${label}.`;
    }
  }

  if (!Array.isArray(input.userData.membership_types) || input.userData.membership_types.length === 0) {
    return "Please select at least one membership type.";
  }

  return null;
}

/* ============================================================
 * WRITE POLICY
 * ============================================================ */

/** Why the profile write never reached the database. */
export type SignupWriteFailure = "credential-unavailable" | "write-timeout";

export const SIGNUP_WRITE_MESSAGES: Record<SignupWriteFailure, string> = {
  "credential-unavailable":
    "Your account was created, but we could not save your registration. Please contact the campaign team so they can complete it.",

  "write-timeout":
    "Your account was created, but saving your registration timed out. Please contact the campaign team so they can complete it.",
};

export class SignupWriteError extends Error {
  readonly reason: SignupWriteFailure;

  constructor(reason: SignupWriteFailure) {
    super(SIGNUP_WRITE_MESSAGES[reason]);
    this.name = "SignupWriteError";
    this.reason = reason;
  }
}

export type Settled<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown }
  | { status: "timeout" };

/**
 * Resolve a promise, or report that it did not settle in time.
 *
 * A dropped Firestore write never rejects — it simply never answers — so
 * a deadline is the only way to notice it.
 */
export async function settleWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<Settled<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race<Settled<T>>([
      promise.then(
        (value) => ({ status: "fulfilled", value }) as const,
        (reason) => ({ status: "rejected", reason }) as const,
      ),
      new Promise<Settled<T>>((resolve) => {
        timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Error codes that mean "the credential or the transport was not ready",
 * not "this write is invalid". Anything else is a real failure and is
 * rethrown unchanged.
 */
const RETRYABLE_CODES = new Set([
  "permission-denied",
  "unavailable",
  "aborted",
  "deadline-exceeded",
]);

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;

  return typeof code === "string" ? code : null;
}

export interface CredentialWriteOptions {
  /** Performs the actual write (same document, same payload, every time). */
  write: () => Promise<void>;

  /**
   * Resolves true when the client is authenticated for the new user.
   * Called before every attempt, so a retry never races the credential
   * again.
   */
  waitForCredential: () => Promise<boolean>;

  /** Total attempts (credential wait + write). Default 3. */
  attempts?: number;

  /** How long one write may stay unsettled before it is retried. */
  writeTimeoutMs?: number;

  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Write the profile, but not before the client can authenticate the call,
 * and never leave the caller waiting on a write that was dropped.
 */
export async function writeWithCredentialRetry(
  options: CredentialWriteOptions,
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const writeTimeoutMs = options.writeTimeoutMs ?? 8_000;

  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  /* Track what actually went wrong, so the caller gets the useful message. */
  let credentialWaitFailed = false;
  let writeTimedOut = false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      /* Short, growing pause: the credential usually lands in milliseconds. */
      await sleep(200 * attempt);
    }

    const ready = await options.waitForCredential();

    if (!ready) {
      credentialWaitFailed = true;
      continue;
    }

    const outcome = await settleWithin(options.write(), writeTimeoutMs);

    if (outcome.status === "fulfilled") return;

    if (outcome.status === "timeout") {
      writeTimedOut = true;
      continue;
    }

    const code = errorCode(outcome.reason);

    if (code && RETRYABLE_CODES.has(code)) continue;

    /* A genuine rejection — invalid payload, offline, rules error we cannot
     * fix by retrying. Surface it as-is. */
    throw outcome.reason;
  }

  throw new SignupWriteError(
    writeTimedOut || !credentialWaitFailed ? "write-timeout" : "credential-unavailable",
  );
}
