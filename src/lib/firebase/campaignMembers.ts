import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "./config";

import { CURRENT_TENANT_ID } from "./tenants";

import type {
  OrganizationalAssignment,
  UserProfile,
  MembershipType,
  Role,
} from "@/types";

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
 * GET ALL CAMPAIGN MEMBERS FOR TENANT
 * ============================================================
 */

export async function getAllCampaignMembersForTenant(
  tenantId: string = CURRENT_TENANT_ID,
): Promise<ScopedCampaignMember[]> {
  const membersQuery = query(
    collection(db, "users"),
    where("tenant_id", "==", tenantId),
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
   * CAMPAIGN-WIDE
   * ----------------------------------------------------------
   */

  if (assignment.scope_type === "campaign") {
    const membersQuery = query(
      collection(db, "users"),
      where("membership_types", "array-contains", "campaign_member"),
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
 * UPDATE MEMBER PROFILE
 * ============================================================
 */

export async function updateCampaignMemberProfile(
  memberId: string,
  data: Partial<UserProfile>,
): Promise<void> {
  const memberRef = doc(db, "users", memberId);

  await updateDoc(memberRef, {
    ...data,
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

