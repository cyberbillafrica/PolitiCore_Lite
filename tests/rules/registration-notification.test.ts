import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  REGISTRATION_ADMIN_CAP,
  registrationAdminRecipients,
} from "@/lib/notifications";
import {
  BASELINE_DOC_COUNT,
  baselineIndexNeedsRepair,
  buildBaselineAccessDocs,
} from "@/lib/campaign-access";
import { planUserStatusBackfill } from "../../scripts/backfill-user-status";

/*
 * ============================================================
 * ROUND 17 — REGISTRATION FAN-OUT, GATE WIRING, BACKFILL
 * ============================================================
 *
 * `registration-gate.test.ts` proves the rules against the emulator.
 * These are the pieces that cannot be expressed as a rules assertion:
 * the recipient planner, the projection-repair predicate, the backfill
 * planner, and the wiring that connects them.
 */

const root = process.cwd();

function read(path: string): string {
  /* Sources mix LF and CRLF; assertions are written against LF. */
  return readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
}

describe("registration admin recipients", () => {
  it("addresses only active admins, treating an absent status as active", () => {
    const recipients = registrationAdminRecipients(
      [
        { id: "admin-active", status: "active" },
        { id: "admin-legacy" },
        { id: "admin-pending", status: "pending" },
        { id: "admin-rejected", status: "rejected" },
        { id: "admin-suspended", status: "suspended" },
      ],
      "new-uid",
    );

    expect(recipients).toEqual(["admin-active", "admin-legacy"]);
  });

  it("never notifies the actor and de-duplicates the audience", () => {
    const recipients = registrationAdminRecipients(
      [{ id: "admin-1" }, { id: "admin-1" }, { id: "new-uid", status: "active" }],
      "new-uid",
    );

    expect(recipients).toEqual(["admin-1"]);
  });

  it(`caps the audience at ${REGISTRATION_ADMIN_CAP}`, () => {
    const admins = Array.from({ length: 30 }, (_, index) => ({
      id: `admin-${index}`,
      status: "active",
    }));

    const recipients = registrationAdminRecipients(admins, "new-uid");

    expect(recipients).toHaveLength(REGISTRATION_ADMIN_CAP);
    expect(recipients[0]).toBe("admin-0");
  });
});

describe("baseline repair predicate", () => {
  const profile = {
    access_role: "member",
    membership_types: ["campaign_member"],
    lga_id: "nkanu-west",
    ward_id: "nkanu-west-ward-01",
    polling_unit_id: "nkanu-west-ward-01-pu-001",
  };

  it("asks for a repair when the index is missing or empty", () => {
    expect(baselineIndexNeedsRepair("uid-1", profile, undefined)).toBe(true);
    expect(baselineIndexNeedsRepair("uid-1", profile, [])).toBe(true);
  });

  it("asks for nothing when every baseline id is recorded", () => {
    const ids = buildBaselineAccessDocs("uid-1", profile).map((doc) => doc.id);

    expect(ids.length).toBeGreaterThan(0);
    expect(baselineIndexNeedsRepair("uid-1", profile, ids)).toBe(false);
  });

  it(`produces the ${BASELINE_DOC_COUNT} documents the approval batch writes`,
    () => {
      const ids = buildBaselineAccessDocs("uid-1", profile).map(
        (doc) => doc.id,
      );

      expect(ids).toHaveLength(BASELINE_DOC_COUNT);
    });

  it("asks for a repair when a single baseline id is missing", () => {
    const ids = buildBaselineAccessDocs("uid-1", profile).map((doc) => doc.id);

    expect(baselineIndexNeedsRepair("uid-1", profile, ids.slice(0, -1))).toBe(
      true,
    );
  });

  it("never repairs a profile that is not baseline eligible", () => {
    expect(
      baselineIndexNeedsRepair(
        "uid-1",
        { ...profile, membership_types: ["social_member"] },
        [],
      ),
    ).toBe(false);
  });
});

describe("user status backfill planner", () => {
  it("selects only missing, null or blank statuses", () => {
    const targets = planUserStatusBackfill([
      { id: "a" },
      { id: "b", status: null },
      { id: "c", status: "" },
      { id: "d", status: "   " },
    ]);

    expect(targets).toEqual(["a", "b", "c", "d"]);
  });

  it("never rewrites an explicit status", () => {
    const targets = planUserStatusBackfill([
      { id: "active", status: "active" },
      { id: "pending", status: "pending" },
      { id: "rejected", status: "rejected" },
      { id: "suspended", status: "suspended" },
    ]);

    expect(targets).toEqual([]);
  });

  it("is idempotent after a dry run target is written", () => {
    const before = [{ id: "a" }];
    const after = [{ id: "a", status: "active" }];

    expect(planUserStatusBackfill(before)).toEqual(["a"]);
    expect(planUserStatusBackfill(after)).toEqual([]);
  });

  it("writes only behind the --apply flag", () => {
    const source = read("scripts/backfill-user-status.ts");

    const dryRunIndex = source.indexOf("if (!apply)");
    const writeIndex = source.indexOf("batch.update(");

    expect(dryRunIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(dryRunIndex);
    expect(source).toContain('process.argv.includes("--apply")');
  });
});

describe("signup writes the gated shape", () => {
  const auth = read("src/lib/firebase/auth.ts");
  const signup = auth.slice(
    auth.indexOf("export async function signUpVolunteer"),
    auth.indexOf("export async function createMemberByAdmin"),
  );

  it("creates the profile with status pending", () => {
    expect(signup).toContain('status: "pending"');
  });

  it("does NOT create the campaign projection for a pending signup", () => {
    expect(signup).not.toContain("ensureBaselineCampaignProjection");
    expect(signup).toContain("NO campaign projection at signup");
  });

  it("notifies admins and then signs the new account out", () => {
    const notifyIndex = signup.indexOf("notifyAdminsOfRegistration(");
    const signOutIndex = signup.indexOf("await signOut(auth)");

    expect(notifyIndex).toBeGreaterThan(-1);
    expect(signOutIndex).toBeGreaterThan(notifyIndex);
  });

  it("keeps the admin-created path pre-approved (projection still written)", () => {
    const adminCreate = auth.slice(
      auth.indexOf("export async function createMemberByAdmin"),
    );

    expect(adminCreate).toContain("syncCampaignAccessForUser(newUser.uid)");
    expect(adminCreate).not.toContain('status: "pending"');
  });
});

describe("login gate wiring", () => {
  const login = read("src/app/login/page.tsx");
  const context = read("src/contexts/AuthContext.tsx");

  it("reads the profile after sign-in and refuses blocked statuses", () => {
    expect(login).toContain("getUserProfile(user.uid)");
    expect(login).toContain("isBlockedAccountStatus(status)");
    expect(login).toContain("blockedAccountMessage(status)");
    expect(login).toContain("await logOut()");
  });

  it("ejects mid-session status changes for pending, rejected and suspended", () => {
    expect(context).toContain("isBlockedAccountStatus(userProfile?.status)");
    expect(context).toContain("flagAccountNotice(status)");
    expect(context).toContain("subscribeToUserStatus");
  });

  it("does not eject the account its own signup is still writing", () => {
    /* Round 17B: the watcher must go through the signup-aware gate. */
    expect(context).toContain("shouldEjectForAccountStatus(status)");
    expect(context).toContain("shouldEjectForAccountStatus(userProfile?.status)");
  });

  it("repairs a missing projection on login", () => {
    expect(context).toContain(
      "repairBaselineCampaignProjection(firebaseUser.uid, data)",
    );
  });

  it("tells the volunteer their registration is awaiting approval", () => {
    const volunteer = read("src/app/volunteer/page.tsx");

    expect(volunteer).toContain("Registration Submitted");
    expect(volunteer).toContain("awaiting administrator approval");
    expect(volunteer).not.toContain("Login Now");
  });
});

describe("admin approval is one batch", () => {
  const userAccess = read("src/lib/firebase/userAccess.ts");
  const approval = userAccess.slice(
    userAccess.indexOf("export async function approveRegistration"),
    userAccess.indexOf("export async function removeBaselineCampaignProjection"),
  );
  const page = read("src/app/portal/admin/registrations/page.tsx");

  it("writes the profile and the projection documents before ONE commit", () => {
    const updateIndex = approval.indexOf('batch.update(doc(db, "users", userId)');
    const setIndex = approval.indexOf('batch.set(\n        doc(db, "user_access"');
    const commitIndex = approval.indexOf("await batch.commit()");

    expect(updateIndex).toBeGreaterThan(-1);
    expect(setIndex).toBeGreaterThan(updateIndex);
    expect(commitIndex).toBeGreaterThan(setIndex);

    /* One commit only: the profile and the grants land together. */
    const commitPhrase = "await batch.commit()";

    expect(commitIndex).toBeGreaterThan(-1);
    expect(
      approval.indexOf("batch.commit()", commitIndex + commitPhrase.length),
    ).toBe(-1);
  });

  it("pins identity, status and the index against admin edits", () => {
    expect(approval).toContain("delete cleanEdits.status");
    expect(approval).toContain("delete cleanEdits[ACCESS_PROJECTION_IDS_FIELD]");
  });

  it("calls the batch from the review page with the acting admin", () => {
    expect(page).toContain("approveRegistration(");
    expect(page).toContain("{ actorId: profile.id }");
    expect(page).toContain("rejectRegistration(");
    expect(page).toContain("reopenRegistration(");
  });
});

describe("rules wiring", () => {
  const rules = read("firestore.rules");

  it("only accepts a pending status on a self-created profile", () => {
    expect(rules).toContain(
      'request.resource.data.get("status", "") == "pending"',
    );
  });

  it("pins status and the projection index on owner updates", () => {
    expect(rules).toContain(
      'request.resource.data.get("status", "")\n          == resource.data.get("status", "")',
    );
    expect(rules).toContain(
      'request.resource.data.get("access_projection_ids", [])\n          == resource.data.get("access_projection_ids", [])',
    );
  });

  it("keeps only an explicit active status past isActiveUser()", () => {
    expect(rules).toContain('callerProfile().status == "active"');
  });

  it("accepts the three registration notification types", () => {
    expect(rules).toContain('"registration_pending"');
    expect(rules).toContain('"registration_approved"');
    expect(rules).toContain('"registration_rejected"');
  });
});
