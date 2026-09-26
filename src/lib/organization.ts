import type {
  OrganizationalAssignment,
  OrganizationalPosition,
  ScopeType,
} from "@/types";

export type OrganizationalScope = {
  assignment: OrganizationalAssignment | null;

  position: OrganizationalPosition | null;

  scopeType: ScopeType | null;

  scopeId: string | null;

  label: string;
};

/**
 * Human-readable organizational position.
 */
export function formatOrganizationalPosition(
  position: OrganizationalPosition | null,
): string {
  if (!position) return "Campaign Member";

  switch (position) {
    case "campaign_member":
      return "Campaign Council Member";

    case "ward_coordinator":
      return "Ward Coordinator";

    case "lga_coordinator":
      return "LGA Coordinator";

    case "zone_coordinator":
      return "Zone Coordinator";

    case "state_coordinator":
      return "State Coordinator";

    case "campaign_manager":
      return "Campaign Manager";

    case "council_chairman":
      return "Council Chairman";

    default:
      return "Campaign Member";
  }
}

/**
 * Human-readable scope type.
 */
export function formatScopeType(scopeType: ScopeType | null): string {
  if (!scopeType) return "Campaign";

  switch (scopeType) {
    case "polling_unit":
      return "Polling Unit";

    case "ward":
      return "Ward";

    case "lga":
      return "LGA";

    case "senatorial_zone":
      return "Senatorial Zone";

    case "state":
      return "State";

    case "campaign":
      return "Campaign";

    default:
      return "Campaign";
  }
}

/**
 * Select the user's primary active organizational assignment.
 *
 * A person may eventually have multiple assignments.
 *
 * For example:
 *
 *   Ward Coordinator
 *   + Campaign Committee Member
 *
 * We currently use a predictable priority rather than allowing
 * dashboard rendering to depend on Firestore ordering.
 */
export function getPrimaryOrganizationalAssignment(
  assignments: OrganizationalAssignment[],
): OrganizationalAssignment | null {
  if (!assignments.length) return null;

  const priority: OrganizationalPosition[] = [
    "council_chairman",
    "campaign_manager",
    "state_coordinator",
    "zone_coordinator",
    "lga_coordinator",
    "ward_coordinator",
    "campaign_member",
  ];

  for (const position of priority) {
    const match = assignments.find(
      (assignment) =>
        assignment.position === position && assignment.status === "active",
    );

    if (match) return match;
  }

  return assignments[0] ?? null;
}

/**
 * Resolve the dashboard's organizational scope.
 */
export function getPrimaryOrganizationalScope(
  assignments: OrganizationalAssignment[],
): OrganizationalScope {
  const assignment = getPrimaryOrganizationalAssignment(assignments);

  if (!assignment) {
    return {
      assignment: null,
      position: null,
      scopeType: null,
      scopeId: null,
      label: "Campaign Member",
    };
  }

  return {
    assignment,
    position: assignment.position,
    scopeType: assignment.scope_type,
    scopeId: assignment.scope_id,
    label: formatOrganizationalPosition(assignment.position),
  };
}

