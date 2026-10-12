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

import { getAllEnuguLGAs } from "./electoral";

import type {
  OrganizationalAssignment,
  UserProfile,
  MembershipType,
  Role,
} from "@/types";

/*
 * Firestore caps an `in` filter at 30 values. Ward lists are chunked so
 * an LGA with more wards than that still resolves completely.
 */
const IN_FILTER_LIMIT = 30;

/*
 * ============================================================
 * SCOPED CAMPAIGN MEMBER
 * ============================================================
 */

export interface ScopedCampaignMember extends UserProfile {
  id: string;
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
 * GET SCOPED CAMPAIGN MEMBERS
 * ============================================================
 */

export async function getScopedCampaignMembers(
  assignment: OrganizationalAssignment,
): Promise<ScopedCampaignMembersResult> {
  /*
   * ----------------------------------------------------------
   * CAMPAIGN-WIDE / STATE-WIDE
   * ----------------------------------------------------------
   *
   * Both cover every campaign member in the state, so they share the
   * unscoped directory read.
   */

  if (assignment.scope_type === "campaign" || assignment.scope_type === "state") {
    return { members: await getAllCampaignMembers(), scopeSupported: true };
  }

  /*
   * ----------------------------------------------------------
   * POLLING UNIT
   * ----------------------------------------------------------
   */

  if (assignment.scope_type === "polling_unit") {
    const membersQuery = query(
      collection(db, "users"),
      where("membership_types", "array-contains", "campaign_member"),
      where("polling_unit_id", "==", assignment.scope_id),
    );

    const snapshot = await getDocs(membersQuery);

    return {
      members: snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      })) as ScopedCampaignMember[],
      scopeSupported: true,
    };
  }

  /*
   * ----------------------------------------------------------
   * WARD
   * ----------------------------------------------------------
   */

  if (assignment.scope_type === "ward") {
    const membersQuery = query(
      collection(db, "users"),
      where("membership_types", "array-contains", "campaign_member"),
      where("ward_id", "==", assignment.scope_id),
    );

    const snapshot = await getDocs(membersQuery);

    return {
      members: snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      })) as ScopedCampaignMember[],
      scopeSupported: true,
    };
  }

  /*
   * ----------------------------------------------------------
   * LGA
   * ----------------------------------------------------------
   *
   * An LGA coordinator sees every campaign member registered in any
   * ward belonging to their LGA. The ward list comes from the electoral
   * hierarchy (never a fixed LGA), and a member carries only a
   * registered ward, so `ward_id` is the field that decides membership
   * of the LGA.
   */

  if (assignment.scope_type === "lga") {
    const wardIds = await resolveWardIdsForLgaScope(assignment.scope_id);

    if (wardIds.length === 0) {
      return {
        members: [],
        scopeSupported: false,
        message:
          "The wards for this LGA could not be resolved from the electoral hierarchy.",
      };
    }

    return {
      members: await getCampaignMembersByWardIds(wardIds),
      scopeSupported: true,
    };
  }

  /*
   * ----------------------------------------------------------
   * HIGHER ORGANIZATIONAL LEVELS
   * ----------------------------------------------------------
   */

  return {
    members: [],
    scopeSupported: false,
    message:
      "This organizational scope requires the electoral hierarchy resolver before members can be loaded safely.",
  };
}

/*
 * ============================================================
 * LGA SCOPE -> WARD IDS
 * ============================================================
 *
 * Scope ids are stored by whichever form built the assignment, so an
 * LGA scope may be written as `nkanu-west`, `nkanu-west-lga`, or a bare
 * ward prefix. All three are matched case-insensitively against the
 * electoral hierarchy; nothing is assumed when the LGA is unknown.
 */

async function resolveWardIdsForLgaScope(scopeId: string): Promise<string[]> {
  const target = (scopeId ?? "").trim().toLowerCase();
  if (!target) return [];

  const allLgas = await getAllEnuguLGAs();

  const match = allLgas.find((lga) => {
    const id = lga.id.toLowerCase();
    return (
      id === target ||
      id === target.replace(/-lga$/, "") ||
      `${id}-lga` === target ||
      lga.wards.some((ward) => ward.id.toLowerCase().startsWith(target))
    );
  });

  return match?.wards.map((ward) => ward.id) ?? [];
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

