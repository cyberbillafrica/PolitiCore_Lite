"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getScopedCampaignMembers,
  type ScopedCampaignMember,
} from "@/lib/firebase/campaignMembers";

import type { OrganizationalAssignment } from "@/types";

/*
 * ============================================================
 * HOOK
 * ============================================================
 */

export function useScopedCampaignMembers(
  assignment: OrganizationalAssignment | null,
) {
  const [members, setMembers] = useState<ScopedCampaignMember[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [scopeSupported, setScopeSupported] = useState(true);

  /*
   * ----------------------------------------------------------
   * LOAD
   * ----------------------------------------------------------
   */

  const loadMembers = useCallback(async () => {
    if (!assignment) {
      setMembers([]);
      setError(null);
      setScopeSupported(true);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await getScopedCampaignMembers(assignment);

      setMembers(result.members);

      setScopeSupported(result.scopeSupported);

      if (!result.scopeSupported) {
        setError(
          result.message ?? "This organizational scope is not yet supported.",
        );
      }
    } catch (err) {
      console.error("Failed to load scoped campaign members:", err);

      setMembers([]);

      setScopeSupported(false);

      setError("Unable to load campaign members for this area.");
    } finally {
      setLoading(false);
    }
  }, [assignment]);

  /*
   * ----------------------------------------------------------
   * INITIAL LOAD
   * ----------------------------------------------------------
   */

  useEffect(() => {
    let isMounted = true;

    async function execute() {
      if (!assignment) {
        if (isMounted) {
          setMembers([]);
          setError(null);
          setScopeSupported(true);
          setLoading(false);
        }
        return;
      }

      try {
        const result = await getScopedCampaignMembers(assignment);
        if (isMounted) {
          setMembers(result.members);
          setScopeSupported(result.scopeSupported);
          if (!result.scopeSupported) {
            setError(
              result.message ?? "This organizational scope is not yet supported.",
            );
          } else {
            setError(null);
          }
        }
      } catch (err) {
        console.error("Failed to load scoped campaign members:", err);
        if (isMounted) {
          setMembers([]);
          setScopeSupported(false);
          setError("Unable to load campaign members for this area.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    execute();

    return () => {
      isMounted = false;
    };
  }, [assignment]);

  /*
   * ----------------------------------------------------------
   * RESULT
   * ----------------------------------------------------------
   */

  return {
    members,
    loading,
    error,
    scopeSupported,
    refresh: loadMembers,
  };
}
