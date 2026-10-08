import type { TaskAction } from "@/types";

/**
 * Feature flags
 */
export const FEATURE_TEAMS = false;

/**
 * Referral bonus awarded to referrer when a referred user completes their first verified task.
 */
export const REFERRAL_BONUS_POINTS = 100;

/**
 * Estimated reach multiplier per verified task action.
 */
export const ACTION_REACH_MULTIPLIERS: Record<string, number> = {
  Like: 1,
  Comment: 3,
  "Like and Comment": 4,
  Share: 25,
  "Comment and Share": 28,
  "Make Post": 40,
};

/**
 * Returns estimated reach for a given action and verified submissions count.
 */
export function calculateEstimatedReach(
  action: TaskAction | string,
  verifiedCount: number,
): number {
  const multiplier = ACTION_REACH_MULTIPLIERS[action] ?? 1;
  return verifiedCount * multiplier;
}

/**
 * Proof URL is required only when the member produces new content
 * that an admin must inspect.
 */
export function requiresProof(action?: TaskAction | string): boolean {
  return (
    action === "Share" ||
    action === "Comment and Share" ||
    action === "Make Post"
  );
}
