import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "./config";

import {
  scopeForAssignment,
  type CampaignScope,
} from "@/lib/campaign-scope";

import type {
  OrganizationalAssignment,
  OrganizationalPosition,
  UserProfile,
  MembershipType,
  Role,
} from "@/types";

/*
 * Firestore caps an `in` filter at 30 values. Ward lists are chunked so
 * an LGA (or zone) with more wards than that still resolves completely.
 */
const IN_FILTER_LIMIT = 30;

/*
 * ============================================================
 * SCOPED CAMPAIGN MEMBER
 * ============================================================
 */

export interface ScopedCampaignMember extends UserProfile {
  id: string;

  /** Position resolved from organizational_assignments, if any. */
  position?: OrganizationalPosition | null;

  /** Scope of that position, for the coordinator sub-list. */
  position_scope?: { level: string; scope_id: string } | null;
}

/*
 * ============================================================
 * RESULT
 * ============================================================
 */

export interface ScopedCampaignMembersResult {
  members: ScopedCampaignMember[];
  scopeSupported: boolean;
  message?: string;
}

/*
 * ============================================================
 * GET ALL CAMPAIGN MEMBERS
 * ============================================================
 */

export async function getAllCampaignMembers(): Promise<ScopedCampaignMember[]> {
  const membersQuery = query(
    collection(db, "users"),
    where("membership_types", "array-contains", "campaign_member"),
  );

  const snapshot = await getDocs(membersQuery);

  const documents = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  })) as ScopedCampaignMember[];

  return documents.sort((a, b) => {
    const left = a.full_name ?? a.email ?? "";
    const right = b.full_name ?? b.email ?? "";
    return left.localeCompare(right);
  });
}

/*
 * ============================================================
 * MEMBERS INSIDE A RESOLVED SCOPE
 * ============================================================
 *
 * This is the single member query the campaign pages use. Callers pass
 * a scope that has already been expanded by `resolveCampaignScope()`,
 * so a zone/LGA/ward/PU all reduce to `ward_id in [...]` or a single
 * `polling_unit_id` equality.
 */

export async function getCampaignMembersInScope(
  scope: CampaignScope,
): Promise<ScopedCampaignMember[]> {
  if (scope.level === "state" || scope.level === "campaign") {
    return getAllCampaignMembers();
  }

  if (scope.level === "polling_unit") {
    const membersQuery = query(
      collection(db, "users"),
      where("membership_types", "array-contains", "campaign_member"),
      where("polling_unit_id", "==", scope.scope_id),
    );

    const snapshot = await getDocs(membersQuery);

    return snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as ScopedCampaignMember[];
  }

  return getCampaignMembersByWardIds(scope.wardIds);
}

/*
 * ============================================================
 * GET SCOPED CAMPAIGN MEMBERS (assignment-based wrapper)
 * ============================================================
 *
 * Kept for callers that hold an assignment rather than a resolved
 * scope (the assignment create form resolves its target members this
 * way). A `campaign_member` marker assignment authorises nothing, and
 * a scope that cannot be resolved returns `scopeSupported: false`.
 */

export async function getScopedCampaignMembers(
  assignment: OrganizationalAssignment,
): Promise<ScopedCampaignMembersResult> {
  const scope = await scopeForAssignment(assignment);

  if (!scope) {
    return {
      members: [],
      scopeSupported: false,
      message:
        "This position does not widen read authority beyond the member's own polling unit.",
    };
  }

  if (scope.lgaIds.length === 0 && scope.wardIds.length === 0) {
    return {
      members: [],
      scopeSupported: false,
      message:
        "This organizational scope could not be resolved from the electoral hierarchy.",
    };
  }

  return {
    members: await getCampaignMembersInScope(scope),
    scopeSupported: true,
  };
}

/*
 * ============================================================
 * QUERY MEMBERS IN A SET OF WARDS
 * ============================================================
 */

async function getCampaignMembersByWardIds(
  wardIds: string[],
): Promise<ScopedCampaignMember[]> {
  const unique = Array.from(new Set(wardIds.filter(Boolean)));
  if (unique.length === 0) return [];

  const byId = new Map<string, ScopedCampaignMember>();

  for (let index = 0; index < unique.length; index += IN_FILTER_LIMIT) {
    const chunk = unique.slice(index, index + IN_FILTER_LIMIT);

    const membersQuery = query(
      collection(db, "users"),
      where("membership_types", "array-contains", "campaign_member"),
      where("ward_id", "in", chunk),
    );

    const snapshot = await getDocs(membersQuery);

    for (const document of snapshot.docs) {
      byId.set(document.id, {
        id: document.id,
        ...document.data(),
      } as ScopedCampaignMember);
    }
  }

  return Array.from(byId.values());
}

/*
 * ============================================================
 * POSITIONS FOR A SET OF MEMBERS
 * ============================================================
 *
 * Positions live in organizational_assignments, never on the profile.
 * This resolves them in one query so the Members page can show a
 * coordinator's position and sub-scope without N+1 reads.
 */

export async function getMemberPositions(
  userIds: string[],
): Promise<
  Map<string, { position: OrganizationalPosition; level: string; scope_id: string }>
> {
  const result = new Map<
    string,
    { position: OrganizationalPosition; level: string; scope_id: string }
  >();

  const unique = Array.from(new Set(userIds.filter(Boolean)));

  for (let index = 0; index < unique.length; index += IN_FILTER_LIMIT) {
    const chunk = unique.slice(index, index + IN_FILTER_LIMIT);

    const snapshot = await getDocs(
      query(
        collection(db, "organizational_assignments"),
        where("user_id", "in", chunk),
        where("status", "==", "active"),
      ),
    );

    for (const document of snapshot.docs) {
      const data = document.data();
      const userId = String(data.user_id ?? "");
      const position = data.position as OrganizationalPosition;

      if (!userId || !position) continue;

      /* Highest-ranking position wins for display. */
      const rank: Record<string, number> = {
        council_chairman: 100,
        campaign_manager: 90,
        state_coordinator: 80,
        zone_coordinator: 70,
        lga_coordinator: 60,
        ward_coordinator: 50,
        pu_coordinator: 40,
        campaign_member: 10,
      };

      const existing = result.get(userId);
      if (existing && (rank[existing.position] ?? 0) >= (rank[position] ?? 0)) {
        continue;
      }

      result.set(userId, {
        position,
        level: String(data.scope_type ?? ""),
        scope_id: String(data.scope_id ?? ""),
      });
    }
  }

  return result;
}

/*
 * ============================================================
 * GET USER PROFILE BY ID
 * ============================================================
 */

export async function getCampaignMemberById(
  memberId: string,
): Promise<ScopedCampaignMember | null> {
  const memberDoc = await getDoc(doc(db, "users", memberId));

  if (!memberDoc.exists()) {
    return null;
  }

  return {
    id: memberDoc.id,
    ...memberDoc.data(),
  } as ScopedCampaignMember;
}

/**
 * True when `memberId` falls inside the viewer's resolved scope.
 *
 * Used by the member detail page: a member's profile is readable in
 * Firestore by any signed-in account, so the scope boundary has to be
 * enforced in the data layer as well.
 */
export function isMemberInScope(
  member: ScopedCampaignMember | null,
  scope: CampaignScope | null,
): boolean {
  if (!member || !scope) return false;
  if (scope.level === "state" || scope.level === "campaign") return true;

  if (scope.level === "polling_unit") {
    return member.polling_unit_id === scope.scope_id;
  }

  const wardId = member.ward_id ?? "";
  if (!wardId) return false;

  return scope.wardIds.includes(wardId);
}

/*
 * ============================================================
 * DELETE MEMBER
 * ============================================================
 *
 * Removes the member's profile document. Firestore rules restrict this
 * to admins (`allow delete: if isAdmin()` on /users).
 *
 * Note: this deletes the profile record only. The Firebase Auth account
 * is a separate resource and is not removed from the client SDK.
 */

export async function deleteCampaignMember(memberId: string): Promise<void> {
  await deleteDoc(doc(db, "users", memberId));
}

/*
 * ============================================================
 * MEMBER SUSPENSION
 * ============================================================
 *
 * A suspended member is blocked from the portal until an admin
 * lifts the suspension. The profile document is NEVER deleted, so
 * the member's prior submissions (PU reports, incidents, results)
 * remain intact and auditable.
 *
 * Writes `status` ("suspended" / "active") plus optional audit
 * fields. Admin-only by the `users` rules (`allow update: if
 * isAdmin()`), so this write passes the rules as written.
 */
export async function setMemberSuspended(
  memberId: string,
  suspended: boolean,
  adminUserId: string,
): Promise<void> {
  const memberRef = doc(db, "users", memberId);

  await updateDoc(memberRef, {
    status: suspended ? "suspended" : "active",
    suspended_at: suspended ? serverTimestamp() : null,
    suspended_by: suspended ? adminUserId : null,
    updated_at: serverTimestamp(),
  });
}

/*
 * ============================================================
 * UPDATE MEMBER PROFILE
 * ============================================================
 */

export async function updateCampaignMemberProfile(
  memberId: string,
  data: Partial<UserProfile>,
): Promise<void> {
  const memberRef = doc(db, "users", memberId);

  /*
   * The document id IS the member's user id, and both `id` and
   * `user_id` are immutable identifiers — never let a caller rewrite
   * them through a generic profile update.
   */
  const rest = { ...data } as Partial<UserProfile> & {
    id?: unknown;
    user_id?: unknown;
  };

  delete rest.id;

  delete (rest as { user_id?: unknown }).user_id;

  await updateDoc(memberRef, {
    ...rest,
    updated_at: serverTimestamp(),
  });
}

/*
 * ============================================================
 * UPDATE MEMBERSHIP TYPES
 * ============================================================
 */

export async function updateMemberMembershipTypes(
  memberId: string,
  membershipTypes: MembershipType[],
): Promise<void> {
  const memberRef = doc(db, "users", memberId);

  await updateDoc(memberRef, {
    membership_types: membershipTypes,
    updated_at: serverTimestamp(),
  });
}

/*
 * ============================================================
 * UPDATE ACCESS ROLE
 * ============================================================
 */

export async function updateMemberAccessRole(
  memberId: string,
  accessRole: Role,
): Promise<void> {
  const memberRef = doc(db, "users", memberId);

  await updateDoc(memberRef, {
    access_role: accessRole,
    updated_at: serverTimestamp(),
  });
}
