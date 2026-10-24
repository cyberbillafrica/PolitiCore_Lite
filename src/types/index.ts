// ============================================================
// SYSTEM ACCESS ROLES
// ============================================================
//
// These are application-level access roles.
// DO NOT use this for Ward/LGA/Zone/State positions.
//
// Organizational positions are handled separately through
// OrganizationalAssignment.
//

export type Role = "admin" | "member" | "election_officer";

// ============================================================
// MEMBERSHIP TYPES
// ============================================================

export type MembershipType = "campaign_member" | "social_member";

// ============================================================
// ORGANIZATIONAL POSITIONS
// ============================================================

export type OrganizationalPosition =
  | "campaign_member"
  | "pu_coordinator"
  | "ward_coordinator"
  | "lga_coordinator"
  | "zone_coordinator"
  | "state_coordinator"
  | "campaign_manager"
  | "council_chairman";

// ============================================================
// CAMPAIGN POSITIONS
// ============================================================
//
// The coordinator ranks of the campaign hierarchy, from the polling
// unit upward. A plain member holds none of these — their scope is
// their registered polling unit.

export type CampaignPosition =
  | "pu_coordinator"
  | "ward_coordinator"
  | "lga_coordinator"
  | "zone_coordinator"
  | "state_coordinator";

// ============================================================
// ORGANIZATIONAL SCOPE
// ============================================================

export type ScopeType =
  | "polling_unit"
  | "ward"
  | "lga"
  | "senatorial_zone"
  | "state"
  | "campaign";

// ============================================================
// ASSIGNMENT STATUS
// ============================================================

export type OrganizationalAssignmentStatus =
  | "active"
  | "inactive"
  | "suspended"
  | "expired";

// ============================================================
// ORGANIZATIONAL ASSIGNMENT
// ============================================================

export interface OrganizationalAssignment {
  id: string;

  user_id: string;

  position: OrganizationalPosition;

  scope_type: ScopeType;

  scope_id: string;

  status: OrganizationalAssignmentStatus;

  assigned_by: string;

  assigned_at?: unknown;

  starts_at?: unknown;
  ends_at?: unknown;

  created_at?: unknown;
  updated_at?: unknown;
}

// ============================================================
// NEWS
// ============================================================

export type NewsStatus = "draft" | "published" | "scheduled" | "archived";

export interface NewsArticle {
  id: string;

  title: string;
  slug: string;

  excerpt: string;
  content: string;

  featured_image?: string | null;

  category?: string | null;

  status: NewsStatus;

  // Support legacy boolean flag
  published?: boolean;

  published_at?: unknown | null;
  scheduled_at?: unknown | null;

  author?: string | null;

  created_by: string;
  updated_by?: string | null;

  created_at: unknown;
  updated_at: unknown;
}

// ============================================================
// PERMISSIONS
// ============================================================

export type Permission =
  // General
  | "view_dashboard"
  | "view_area"

  // Members
  | "view_members"
  | "view_member_contacts"
  | "manage_members"

  // Campaign assignments
  | "view_assignments"
  | "create_assignment"
  | "assign_task"
  | "review_assignment"

  // Campaign activities
  | "view_activities"
  | "create_activity"
  | "manage_activity"
  | "view_activity_reports"

  // Field reporting
  | "submit_field_report"
  | "review_field_report"

  // Issues
  | "report_issue"
  | "manage_issue"

  // Communications
  | "view_notices"
  | "send_notice"

  // Documents
  | "view_documents"
  | "manage_documents"

  // Analytics
  | "view_analytics"

  // Organization
  | "manage_organization"
  | "manage_permissions"

  // Campaign administration
  | "manage_campaign_settings"

  // Election
  | "submit_election_pu_report"
  | "submit_election_incident"
  | "upload_election_result"
  | "view_election_dashboard"
  | "manage_election_settings"

  // Donations
  | "view_private_donations"
  | "manage_private_donations"
  | "view_public_donations"
  | "manage_public_donations";

// ============================================================
// PERMISSION GRANT
// ============================================================

export interface PermissionGrant {
  id: string;

  user_id: string;

  permission: Permission;

  granted: boolean;

  scope_type?: ScopeType | null;
  scope_id?: string | null;

  granted_by: string;

  created_at?: unknown;
  updated_at?: unknown;
}

// ============================================================
// CAMPAIGN ACTIVITIES
// ============================================================

export type CampaignActivityType =
  | "meeting"
  | "rally"
  | "community_engagement"
  | "training"
  | "coordination"
  | "stakeholder_meeting"
  | "other";

export type CampaignActivityStatus =
  | "scheduled"
  | "ongoing"
  | "completed"
  | "cancelled";

export interface CampaignActivity {
  id: string;

  title: string;
  description?: string;

  activity_type: CampaignActivityType;
  status: CampaignActivityStatus;

  date: string;
  start_time?: string;
  end_time?: string;

  venue?: string;

  scope_type: ScopeType;
  scope_id: string;

  organizer_id: string;
  organizer_name?: string;

  expected_attendance?: number;

  created_at?: unknown;
  updated_at?: unknown;
}

// ============================================================
// USER PROFILE
// ============================================================

export interface UserProfile {
  id?: string;

  // Personal information
  full_name: string;
  email: string;
  phone: string;
  gender: string;

  // Registered electoral location
  lga_id?: string;
  ward_id: string;
  polling_unit_id: string;

  // Social media identity
  facebook_name?: string;
  facebook_profile_url?: string;

  instagram_name?: string;
  instagram_profile_url?: string;

  x_name?: string;
  x_profile_url?: string;

  tiktok_name?: string;
  tiktok_profile_url?: string;

  // System access
  access_role: Role;

  /*
   * Account status. Valid values: "active" (default) and
   * "suspended". An ABSENT field counts as active.
   *
   * A suspended member is blocked from the portal until an admin
   * lifts the suspension (see docs/member-suspension.md). The
   * optional audit fields record when and by whom.
   */
  status?: string;
  suspended_at?: unknown;
  suspended_by?: string | null;

  // Membership
  membership_types: MembershipType[];

  // Social points & referrals
  points: number;
  rank: string;
  referral_code?: string;
  referred_by?: string | null;
  team_id?: string | null;

  created_at?: unknown;
  updated_at?: unknown;
}

// ============================================================
// SOCIAL TASKS & SUBMISSIONS
// ============================================================

export type TaskPlatform = "Facebook" | "X" | "Instagram" | "TikTok";

export type TaskAction =
  | "Like"
  | "Comment"
  | "Like and Comment"
  | "Share"
  | "Comment and Share"
  | "Make Post";

export type TaskStatus = "active" | "inactive" | "archived";

export interface SocialTask {
  id: string;
  platform: TaskPlatform;
  action: TaskAction;
  points: number;
  url: string;
  deadline?: string | null;
  status: TaskStatus;
  created_at?: unknown;
  created_by?: string;
  updated_at?: unknown;
  updated_by?: string;
  archived_at?: unknown;
  archived_by?: string;
  [key: string]: unknown;
}

export interface TaskSubmission {
  id: string;
  task_id: string;
  user_id: string;
  status: "pending" | "verified";
  proof_url?: string | null;
  source?: "task" | "referral_bonus";
  submitted_at?: unknown;
  verified_at?: unknown;
  verified_by?: string;
  [key: string]: unknown;
}

// ============================================================
// MANIFESTO
// ============================================================

export interface ElectionResultRecord {
  id?: string;
  ward_id: string;
  lga_id?: string;
  polling_unit_id: string;
  results: Array<{
    party: string;
    votes: number;
  }>;
  submitted_by: string;
  verified: boolean;
  created_at?: unknown;
  updated_at?: unknown;
}

export interface ManifestoSection {
  id: string;
  title: string;
  icon?: string; // emoji
  description: string;
  points: string[];
}

export interface ManifestoData {
  title: string;
  subtitle: string;
  introduction: string;
  candidate_name: string;
  candidate_title: string;
  sections: ManifestoSection[];
  closing: string;
  call_to_action: string;
  call_to_action_link: string;
  pdf_url?: string | null;
  status: "draft" | "published";
  created_at?: unknown;
  updated_at?: unknown;
}

// ============================================================
// BIOGRAPHY
// ============================================================

export interface BiographyData {
  full_name: string;
  title: string; // e.g., "APC Candidate, Nkanu West"
  about: string; // Main biography text
  image_url?: string | null;
  stats: {
    years_experience: number;
    communities_served: number;
    volunteers: number;
  };
  social_links?: {
    facebook?: string;
    x?: string;
    instagram?: string;
    tiktok?: string;
  };
  status: "draft" | "published";
  created_at?: unknown;
  updated_at?: unknown;
}

// ============================================================
// GALLERY
// ============================================================

export interface GalleryImage {
  id: string;
  url: string;
  title: string;
  description?: string;
  uploaded_at: string;
}

export interface GalleryData {
  images: GalleryImage[];
  updated_at?: unknown;
}

// ============================================================
// CANDIDATE DONATION & CONTRIBUTION LEDGER
// ============================================================

export type DonationStatus = "received" | "pledged" | "cancelled";

export type DonationSourceMethod =
  | "cash"
  | "bank_transfer"
  | "pos"
  | "cheque"
  | "other";

export interface DonorRecord {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  reference_identifier?: string | null;
  lga_id?: string | null;
  ward_id?: string | null;
  total_received_amount: number;
  contribution_count: number;
  latest_contribution_date?: string | null;
  created_at?: unknown;
  updated_at?: unknown;
}

export interface DonationRecord {
  id: string;
  donor_id?: string | null;
  donor_name: string;
  donor_phone?: string | null;
  donor_email?: string | null;
  donor_reference?: string | null;
  amount: number;
  currency: string;
  date_received: string; // YYYY-MM-DD
  payment_method: DonationSourceMethod;
  category: string; // e.g., "campaign_fund", "event_sponsorship", "logistics"
  status: DonationStatus;
  external_reference?: string | null;
  notes?: string | null;
  lga_id?: string | null;
  ward_id?: string | null;
  created_by: string;
  created_by_name?: string | null;
  created_at?: unknown;
  updated_by?: string | null;
  updated_at?: unknown;
}

export interface DonationAuditLog {
  id: string;
  donation_id: string;
  action: "created" | "updated" | "status_changed" | "cancelled";
  performed_by: string;
  performed_by_name?: string | null;
  performed_at?: unknown;
  details: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
}

// ============================================================
// ANNOUNCEMENTS & EVENTS (Combined)
// ============================================================

export type AnnouncementScope =
  | "general"
  | "campaign_members"
  | "social_members"
  | "election_officers"
  | "admins";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  scope: AnnouncementScope; // Who sees this in the portal
  type: "announcement"; // Discriminator
  created_at?: string;
  updated_at?: unknown;
}

export interface EventData {
  id: string;
  title: string;
  description: string;
  date: string; // ISO date string
  time: string;
  venue: string;
  ward: string;
  type: "event"; // Discriminator
  status: "draft" | "published";
  created_at?: string;
  updated_at?: unknown;
}

// Union type for combined admin management
export type PortalContent = Announcement | EventData;

export interface PortalContentData {
  items: PortalContent[];
  updated_at?: unknown;
}

// ============================================================
// NOTIFICATIONS (per-user inbox)
// ============================================================
//
// A notification is one row addressed to ONE user. Unlike an
// announcement (a single portal_content item broadcast to a scope),
// read state is stored on the document, so it follows the account
// across devices.

export type NotificationType =
  | "assignment_created"
  | "assignment_completed"
  | "assignment_approved"
  | "assignment_rejected"
  | "report_reviewed"
  | "issue_raised"
  | "issue_status_changed"
  | "activity_created"
  | "role_assigned";

export interface AppNotification {
  id: string;

  user_id: string;
  actor_id: string;

  type: NotificationType;

  title: string;
  message: string;

  /** Portal path to open when the notification is clicked. */
  link: string;

  entity_type: string;
  entity_id: string;

  read: boolean;
  created_at?: unknown;
  read_at?: unknown;
}

// ============================================================
// ELECTION TYPES — ported from politicore-firebase-final (3be40b7)
// ============================================================

export interface PollingUnit {
  id: string;
  code: string;
  name: string;
  isNew?: boolean;
}

export interface Ward {
  id: string;
  code: string;
  name: string;
  pollingUnits: PollingUnit[];
}

export interface LGA {
  id: string;
  code: string;
  name: string;
  wards: Ward[];
}

export interface EnuguStateElectoralData {
  id?: string;
  state: string;
  lgas: LGA[];
  updated_at?: unknown;
}

export type ContestType =
  | "presidential"
  | "governorship"
  | "senatorial"
  | "federal_house"
  | "state_house";

export type ContestScopeType =
  | "national"
  | "state"
  | "senatorial_zone"
  | "federal_constituency"
  | "state_constituency";

export type ElectionCycleStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "PAUSED"
  | "CLOSED"
  | "ARCHIVED";

export type ContestStatus = "DRAFT" | "OPEN" | "PAUSED" | "CLOSED";

export type CollationStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "PAUSED";

export interface ElectionCycle {
  id: string;
  name: string;
  year: number;
  description?: string;
  status: ElectionCycleStatus;
  start_date?: string;
  end_date?: string;
  created_by: string;
  created_at?: unknown;
  updated_at?: unknown;
}

export interface ElectionContest {
  id: string;
  election_cycle_id: string;
  contest_type: ContestType;
  name: string;
  scope_type: ContestScopeType;
  scope_id: string;
  state_id?: string;
  senatorial_zone_id?: string;
  lga_ids?: string[];
  election_date?: string;
  status: ContestStatus;
  collation_status: CollationStatus;
  tracked_parties: string[];
  participating_parties?: string[];
  focus_party_id?: string;
  created_by: string;
  created_at?: unknown;
  updated_at?: unknown;
}

export interface PoliticalParty {
  id: string;
  acronym: string;
  name: string;
  logo_url?: string | null;
  inec_registered: boolean;
  status: "active" | "inactive";
  color?: string;
  created_at?: unknown;
  updated_at?: unknown;
}

export interface ElectionCandidate {
  id: string;
  contest_id: string;
  party_id: string;
  candidate_name: string;
  running_mate_name?: string;
  status: "active" | "disqualified" | "withdrawn";
  created_at?: unknown;
  updated_at?: unknown;
}

export interface ElectionSettings {
  id?: string;
  active_election_cycle_id: string | null;
  active_contest_id: string | null;
  /*
   * Master switch for election activity. `undefined` is treated as
   * ON so an unconfigured deployment is not locked out. The FieldValue
   * is mirrored by `electionModeEnabled()` in firestore.rules.
   */
  election_mode_enabled?: boolean;
  updated_by?: string;
  updated_at?: unknown;
}

/*
 * ============================================================
 * ELECTION AUDIT TRAIL (election_audit)
 * ============================================================
 *
 * Append-only log of state changes to election results (submit /
 * approve / reject / clarify / reopen / delete). Written by the
 * client under strict rules: officers and admins may CREATE an
 * entry; nobody may update or delete one.
 */

export type ElectionAuditAction =
  | "result_submitted"
  | "result_corrected"
  | "result_approved"
  | "result_rejected"
  | "result_clarification_required"
  | "result_reopened"
  | "result_deleted";

export interface ElectionAuditEntry {
  id: string;
  action: ElectionAuditAction;
  target_collection: string;
  target_doc_id: string;
  actor_id: string;
  /** Display-name snapshot of the actor at action time. */
  actor_name: string;
  /** Role snapshot at action time ("admin" | "election_officer" | ..."). */
  actor_role: string;
  at: unknown;
  /** Required for delete actions; optional otherwise. */
  reason: string | null;
  /** FULL contents of the deleted document (delete actions only). */
  snapshot?: Record<string, unknown> | null;
  /** Extra context, e.g. the previous status. */
  metadata?: Record<string, unknown> | null;
}

/*
 * ============================================================
 * CAMPAIGN SCOPING (ROUND 5)
 * ============================================================
 *
 * Campaign work is organised on the same geographic hierarchy the
 * election engine uses (see src/lib/election-scope.ts):
 *
 *   state -> senatorial_zone -> lga -> ward -> polling_unit
 *
 * `ScopeType` is reused verbatim so `assignmentCoversScope()` and
 * `isScopeDescendant()` work without translation. Nothing in this
 * section invents a new scope vocabulary.
 */

/**
 * The geographic target of a scope-targeted campaign assignment.
 */
export interface AssignmentScope {
  level: ScopeType;
  scope_id: string;
  /**
   * Optional position filter, e.g. "pu_coordinator" to target only
   * polling-unit coordinators inside the scope.
   */
  role_filter?: OrganizationalPosition | null;
}

/**
 * A campaign assignment is either individual, scope-targeted, or both.
 *
 * `completion_mode` is derived on write:
 *   - "individual"  when only `assigned_to_user` is present
 *   - "per_person"  when `assigned_to_scope` is present
 */
export type CampaignAssignmentStatus = "open" | "closed";

export type AssignmentCompletionMode = "individual" | "per_person";

export interface CampaignAssignment {
  id: string;

  title: string;
  description?: string;

  created_by: string;
  created_at?: unknown;
  updated_at?: unknown;

  due_at?: string | null;

  /** Direct assignee, when the assignment targets one person. */
  assigned_to_user?: string | null;

  /** Geographic target, when the assignment targets a scope. */
  assigned_to_scope?: AssignmentScope | null;

  /** Legacy single-assignee field, still written for old readers. */
  assigned_to?: string;

  status: CampaignAssignmentStatus;
  completion_mode: AssignmentCompletionMode;

  priority?: "low" | "medium" | "high" | "urgent";

  /**
   * Snapshot of the creator's own scope when the assignment was
   * created. Lets the UI explain why a coordinator could target it.
   */
  created_scope?: { level: ScopeType; scope_id: string } | null;
}

export type AssignmentCompletionStatus =
  | "pending"
  | "submitted"
  | "approved"
  | "rejected";

/**
 * One row per targeted member, stored at
 * campaign_assignments/{id}/completions/{uid}.
 */
export interface AssignmentCompletion {
  id: string;
  assignment_id: string;
  user_id: string;
  status: AssignmentCompletionStatus;
  submitted_at?: unknown;
  reviewed_at?: unknown;
  reviewed_by?: string | null;
  review_notes?: string | null;
  report_id?: string | null;
  updated_at?: unknown;
}

/**
 * A report is a submission against an assignment.
 *
 * Visibility is deliberately narrow: submitter, the assignment's
 * creator, and Admin. It does NOT cascade up the hierarchy.
 */
export type CampaignReportStatus = "submitted" | "approved" | "rejected";

export interface CampaignReport {
  id: string;

  assignment_id: string;
  assignment_creator_id: string;

  submitted_by: string;
  submitted_at?: unknown;

  title: string;
  content: string;

  status: CampaignReportStatus;

  reviewed_by?: string | null;
  reviewed_at?: unknown;
  review_notes?: string | null;

  /** Reporter's scope at submission time (admin filtering). */
  scope_level: ScopeType;
  scope_id: string;

  /** Ward / PU the reporter was registered in, for drill-down. */
  scope_snapshot?: {
    level: ScopeType;
    scope_id: string;
    lga_id?: string | null;
    ward_id?: string | null;
    polling_unit_id?: string | null;
  } | null;
}

/**
 * An issue cascades UP: the raiser sees it, every coordinator whose
 * scope covers it sees it, and Admin sees everything.
 */
export type CampaignIssueStatus = "open" | "acknowledged" | "resolved";

export interface CampaignIssue {
  id: string;

  raised_by: string;
  raised_at?: unknown;

  title: string;
  description: string;

  scope_level: ScopeType;
  scope_id: string;

  status: CampaignIssueStatus;

  acknowledged_by?: string | null;
  acknowledged_at?: unknown;

  resolved_by?: string | null;
  resolved_at?: unknown;
  resolution_notes?: string | null;

  issue_type?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  location?: string | null;
}
