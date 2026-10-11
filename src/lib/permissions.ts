import type {
  LGA,
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

/*
 * ============================================================
 * HIERARCHY RESOLVER
 * ============================================================
 *
 * Hierarchy:
 *
 *   State ("state") / Campaign ("campaign")
 *     └── Senatorial Zone ("senatorial_zone")
 *           └── LGA ("lga")
 *                 └── Ward ("ward")
 *                       └── Polling Unit ("polling_unit")
 *
 * `lgasData` carries the electoral hierarchy. When it is not
 * supplied the resolver falls back to id-prefix matching, which
 * still links an LGA to its "<lga>-ward-NN" wards and those wards to
 * their "<lga>-ward-NN-pu-NNN" polling units. No LGA is ever assumed.
 */
export function isScopeDescendant(
  sourceScope: PermissionScope,
  targetScope: PermissionScope,
  lgasData?: LGA[],
): boolean {
  if (!sourceScope.scope_type || !targetScope.scope_type) return false;

  const sourceType = sourceScope.scope_type;
  const sourceId = sourceScope.scope_id;
  const targetType = targetScope.scope_type;
  const targetId = targetScope.scope_id;

  // 1. Campaign and State cover everything in the state.
  if (sourceType === "campaign" || sourceType === "state") {
    return true;
  }

  // 2. Senatorial zone covers its own zone and everything below it.
  if (sourceType === "senatorial_zone") {
    if (targetType === "senatorial_zone") {
      return sourceId === targetId;
    }
    return true;
  }

  const lgasList = lgasData ?? [];

  // 3. LGA covers its own LGAs, wards and polling units.
  if (sourceType === "lga") {
    if (targetType === "lga") {
      return sourceId === targetId;
    }

    if (!sourceId) return false;

    const matchedLga = lgasList.find(
      (lga) =>
        lga.id === sourceId || lga.id.toLowerCase() === sourceId.toLowerCase(),
    );

    if (!matchedLga) {
      if (!targetId) return false;
      return targetId.startsWith(sourceId);
    }

    if (targetType === "ward") {
      return matchedLga.wards.some((ward) => ward.id === targetId);
    }

    if (targetType === "polling_unit") {
      return matchedLga.wards.some((ward) =>
        ward.pollingUnits.some((unit) => unit.id === targetId),
      );
    }

    return false;
  }

  // 4. Ward covers itself and the polling units inside it.
  if (sourceType === "ward") {
    if (targetType === "ward") {
      return sourceId === targetId;
    }

    if (targetType === "polling_unit") {
      if (!sourceId || !targetId) return false;

      for (const lga of lgasList) {
        const ward = lga.wards.find((item) => item.id === sourceId);
        if (ward) {
          return ward.pollingUnits.some((unit) => unit.id === targetId);
        }
      }

      return targetId.startsWith(sourceId);
    }

    return false;
  }

  // 5. A polling unit is a leaf.
  if (sourceType === "polling_unit") {
    return targetType === "polling_unit" && sourceId === targetId;
  }

  return false;
}

/**
 * Determine whether an assignment covers a requested scope.
 *
 * A direct scope match is always allowed:
 *
 *   ward -> same ward
 *   lga -> same LGA
 *   state -> same state
 *   campaign -> same campaign
 *
 * The optional third argument turns the check into a
 * hierarchy-aware one: a ward-scoped assignment then covers the
 * polling units inside that ward, and an LGA-scoped assignment
 * covers its child wards and their polling units. Passing it is
 * backwards compatible — two-argument callers keep exact
 * matching semantics plus prefix fallback.
 */
export function assignmentCoversScope(
  assignment: OrganizationalAssignment,
  scope?: PermissionScope,
  lgasData?: LGA[],
): boolean {
  if (!scope?.scope_type || !scope.scope_id) {
    return true;
  }

  if (
    assignment.scope_type === scope.scope_type &&
    assignment.scope_id === scope.scope_id
  ) {
    return true;
  }

  return isScopeDescendant(
    {
      scope_type: assignment.scope_type,
      scope_id: assignment.scope_id,
    },
    scope,
    lgasData,
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
          "upload_election_result",
          "submit_election_pu_report",
          "submit_election_incident",
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
          "upload_election_result",
          "submit_election_pu_report",
          "submit_election_incident",
          "view_election_dashboard",
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
          "upload_election_result",
          "submit_election_pu_report",
          "submit_election_incident",
          "view_election_dashboard",
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
          "upload_election_result",
          "submit_election_pu_report",
          "submit_election_incident",
          "view_election_dashboard",
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
          "upload_election_result",
          "submit_election_pu_report",
          "submit_election_incident",
          "view_election_dashboard",
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
      "view_election_dashboard",
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
