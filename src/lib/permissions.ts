import type {
  OrganizationalAssignment,
  Permission,
  PermissionGrant,
  ScopeType,
  UserProfile,
} from "@/types";

export interface PermissionScope {
  scope_type?: ScopeType;
  scope_id?: string;
}

export interface PermissionContext {
  profile: UserProfile | null;
  assignments: OrganizationalAssignment[];
  grants: PermissionGrant[];
}

/**
 * Returns the user's active organizational assignments.
 */
export function getActiveAssignments(
  assignments: OrganizationalAssignment[],
): OrganizationalAssignment[] {
  return assignments.filter((assignment) => assignment.status === "active");
}

/**
 * Returns true when the user has an active campaign membership.
 */
export function isCampaignMember(profile: UserProfile | null): boolean {
  return profile?.membership_types?.includes("campaign_member") ?? false;
}

/**
 * Returns true when the user has social membership.
 */
export function isSocialMember(profile: UserProfile | null): boolean {
  return profile?.membership_types?.includes("social_member") ?? false;
}

/**
 * Returns true when an admin account also carries a campaign membership.
 *
 * This gates admin access to campaign activity management so a social-only
 * admin cannot see or manage campaign activities.
 */
export function isCampaignMemberAdmin(profile: UserProfile | null): boolean {
  if (!profile) return false;

  const isAdminRole = profile.access_role === "admin";

  return isAdminRole && isCampaignMember(profile);
}

/**
 * Returns campaign organizational assignments.
 */
export function getCampaignAssignments(
  assignments: OrganizationalAssignment[],
): OrganizationalAssignment[] {
  return getActiveAssignments(assignments).filter(
    (assignment) =>
      assignment.position === "campaign_member" ||
      assignment.position === "ward_coordinator" ||
      assignment.position === "lga_coordinator" ||
      assignment.position === "zone_coordinator" ||
      assignment.position === "state_coordinator" ||
      assignment.position === "campaign_manager" ||
      assignment.position === "council_chairman",
  );
}

/**
 * Find whether the user has a particular organizational position.
 */
export function hasPosition(
  assignments: OrganizationalAssignment[],
  position: OrganizationalAssignment["position"],
): boolean {
  return getActiveAssignments(assignments).some(
    (assignment) => assignment.position === position,
  );
}

/**
 * Determine whether an assignment covers a requested scope.
 *
 * Current implementation intentionally remains simple.
 *
 * A direct scope match is allowed:
 *
 *   ward -> same ward
 *   lga -> same LGA
 *   state -> same state
 *   campaign -> same campaign
 *
 * Hierarchical expansion can be added later once the full
 * electoral hierarchy is wired into Firestore.
 */
export function assignmentCoversScope(
  assignment: OrganizationalAssignment,
  scope?: PermissionScope,
): boolean {
  if (!scope?.scope_type || !scope.scope_id) {
    return true;
  }

  return (
    assignment.scope_type === scope.scope_type &&
    assignment.scope_id === scope.scope_id
  );
}

/**
 * Check an explicit permission grant.
 *
 * Explicit denial wins over explicit grant.
 */
function hasExplicitGrant(
  grants: PermissionGrant[],
  permission: Permission,
  scope?: PermissionScope,
): boolean | null {
  const matching = grants.filter(
    (grant) =>
      grant.permission === permission &&
      (grant.scope_type == null ||
        (grant.scope_type === scope?.scope_type &&
          grant.scope_id === scope?.scope_id)),
  );

  if (matching.some((grant) => grant.granted === false)) {
    return false;
  }

  if (matching.some((grant) => grant.granted === true)) {
    return true;
  }

  return null;
}

/**
 * Default permissions attached to organizational positions.
 *
 * These are application defaults.
 *
 * Specific exceptions can be handled using permission_grants.
 */
function positionHasPermission(
  assignments: OrganizationalAssignment[],
  permission: Permission,
  scope?: PermissionScope,
): boolean {
  const activeAssignments = getActiveAssignments(assignments);

  return activeAssignments.some((assignment) => {
    if (!assignmentCoversScope(assignment, scope)) {
      return false;
    }

    switch (assignment.position) {
      case "campaign_member":
        return [
          "view_dashboard",
          "view_area",
          "view_assignments",
          "assign_task",

          "view_activities",
          "create_activity",

          "submit_field_report",
          "report_issue",
          "view_notices",
          "view_documents",
        ].includes(permission);

      case "ward_coordinator":
        return [
          "view_dashboard",
          "view_area",
          "view_members",
          "view_member_contacts",
          "view_assignments",
          "create_assignment",
          "assign_task",
          "review_assignment",
          "view_activities",
          "create_activity",
          "manage_activity",
          "view_activity_reports",
          "submit_field_report",
          "review_field_report",
          "report_issue",
          "manage_issue",
          "view_notices",
          "send_notice",
          "view_documents",
          "manage_documents",
          "view_analytics",
        ].includes(permission);

      case "lga_coordinator":
        return [
          "view_dashboard",
          "view_area",
          "view_members",
          "view_member_contacts",
          "view_assignments",
          "create_assignment",
          "assign_task",
          "review_assignment",
          "view_activities",
          "create_activity",
          "manage_activity",
          "view_activity_reports",
          "submit_field_report",
          "review_field_report",
          "report_issue",
          "manage_issue",
          "view_notices",
          "send_notice",
          "view_documents",
          "manage_documents",
          "view_analytics",
        ].includes(permission);

      case "zone_coordinator":
        return [
          "view_dashboard",
          "view_area",
          "view_members",
          "view_member_contacts",
          "view_assignments",
          "create_assignment",
          "assign_task",
          "review_assignment",
          "view_activities",
          "create_activity",
          "manage_activity",
          "view_activity_reports",
          "submit_field_report",
          "review_field_report",
          "report_issue",
          "manage_issue",
          "view_notices",
          "send_notice",
          "view_documents",
          "manage_documents",
          "view_analytics",
        ].includes(permission);

      case "state_coordinator":
        return [
          "view_dashboard",
          "view_area",
          "view_members",
          "view_member_contacts",
          "manage_members",
          "view_assignments",
          "create_assignment",
          "assign_task",
          "review_assignment",
          "view_activities",
          "create_activity",
          "manage_activity",
          "view_activity_reports",
          "submit_field_report",
          "review_field_report",
          "report_issue",
          "manage_issue",
          "view_notices",
          "send_notice",
          "view_documents",
          "manage_documents",
          "view_analytics",
          "manage_organization",
          "manage_permissions",
        ].includes(permission);

      case "campaign_manager":
      case "council_chairman":
        return true;

      default:
        return false;
    }
  });
}

/**
 * Central permission resolver.
 *
 * Priority:
 *
 * 1. System administrator permissions
 * 2. Explicit permission grants/denials
 * 3. Organizational-position defaults
 */
export function hasPermission(
  context: PermissionContext,
  permission: Permission,
  scope?: PermissionScope,
): boolean {
  const { profile, assignments, grants } = context;

  if (!profile) return false;

  /*
   * Existing application admin remains fully privileged.
   *
   * This is deliberate so the new organizational layer does
   * not break the existing admin functionality.
   */
  const isAdminRole = profile.access_role === "admin";

  if (isAdminRole) {
    const campaignActivityPermissions = [
      "view_activities",
      "create_activity",
      "manage_activity",
      "view_activity_reports",
    ];

    if (campaignActivityPermissions.includes(permission)) {
      return isCampaignMember(profile);
    }

    return true;
  }

  /*
   * Election Officer keeps the existing election behavior.
   *
   * We do not convert the existing EO system into the new
   * organizational permission system yet.
   */
  if (profile.access_role === "election_officer") {
    return [
      "view_dashboard",
      "submit_election_pu_report",
      "submit_election_incident",
      "upload_election_result",
    ].includes(permission);
  }

  /*
   * Explicit grants are evaluated before organizational
   * defaults.
   */
  const explicit = hasExplicitGrant(grants, permission, scope);

  if (explicit !== null) {
    return explicit;
  }

  /*
   * Finally use the user's organizational position.
   */
  return positionHasPermission(assignments, permission, scope);
}

/**
 * Useful shortcut for determining whether the user has
 * any active campaign organizational assignment.
 */
export function isCampaignCouncilMember(
  profile: UserProfile | null,
  assignments: OrganizationalAssignment[],
): boolean {
  if (!profile) return false;

  if (!isCampaignMember(profile)) {
    return false;
  }

  return getCampaignAssignments(assignments).length > 0;
}
