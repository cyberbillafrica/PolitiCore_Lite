"use client";

/*
 * ============================================================
 * CAMPAIGN AUTHORITY HOOK
 * ============================================================
 *
 * One hook every campaign page consumes, so no page re-derives "what
 * am I allowed to see" on its own.
 *
 * It combines:
 *
 *   AuthContext .......... profile, active assignments, permissions
 *   campaign-scope.ts .... what those assignments cover, expanded
 *   useElectoralLookup ... the live state-wide hierarchy for labels
 *
 * `scope` is the resolved geographic area of the caller's authority.
 * For a plain member that is their registered polling unit; for a
 * coordinator it is their assignment's scope and everything below it.
 *
 * `scope === null` while loading, or when the user has no resolvable
 * location at all.
 */

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useElectoralLookup } from "@/hooks/useElectoralLookup";

import {
  canCreateAtScope,
  describeScope,
  positionScopeLevel,
  resolveCampaignAuthority,
  resolveCampaignScope,
  type CampaignAuthority,
  type CampaignScope,
} from "@/lib/campaign-scope";

import type { Permission, ScopeType } from "@/types";

export interface CampaignAuthorityState {
  profile: ReturnType<typeof useAuth>["profile"];
  assignments: ReturnType<typeof useAuth>["assignments"];
  hasPermission: ReturnType<typeof useAuth>["hasPermission"];

  loading: boolean;
  isAdmin: boolean;

  authority: CampaignAuthority;

  /** Resolved scope of the caller's authority (null until resolved). */
  scope: CampaignScope | null;
  scopeLoading: boolean;

  /** "Nkanu West Ward 03" style label for the caller's scope. */
  scopeLabel: string;

  /** True when the caller's position widens authority beyond self. */
  isCoordinator: boolean;

  /** Level of the caller's position (null for a plain member). */
  positionLevel: ScopeType | null;

  /** May the caller create an assignment / activity at this target? */
  canCreateAt: (target: { level: ScopeType; scopeId: string }) => boolean;
}

export function useCampaignAuthority(): CampaignAuthorityState {
  const {
    profile,
    assignments,
    loading,
    accessLoading,
    hasPermission,
  } = useAuth();

  const lookup = useElectoralLookup();

  const authority = useMemo(
    () => resolveCampaignAuthority(profile, assignments),
    [profile, assignments],
  );

  const [scope, setScope] = useState<CampaignScope | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);

  const level = authority.level;
  const scopeId = authority.scopeId;
  const ready = lookup.ready;

  useEffect(() => {
    let cancelled = false;

    if (!level || !scopeId || !ready) {
      setScope(null);
      setScopeLoading(false);
      return;
    }

    setScopeLoading(true);

    resolveCampaignScope(level, scopeId, lookup.lgas)
      .then((resolved) => {
        if (cancelled) return;
        setScope(resolved);
        setScopeLoading(false);
      })
      .catch((error: unknown) => {
        console.error("Failed to resolve campaign scope:", error);
        if (cancelled) return;
        setScope(null);
        setScopeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [level, scopeId, ready, lookup.lgas]);

  const scopeLabel = describeScope(level, scopeId, lookup.lgas);

  const canCreateAt = useMemo(
    () =>
      (target: { level: ScopeType; scopeId: string }): boolean =>
        canCreateAtScope(profile, assignments, target, lookup.lgas),
    [profile, assignments, lookup.lgas],
  );

  return {
    profile,
    assignments,
    hasPermission: hasPermission as (
      permission: Permission,
      scope?: { scope_type?: ScopeType; scope_id?: string },
    ) => boolean,
    loading: loading || accessLoading,
    isAdmin: authority.isAdmin,
    authority,
    scope,
    scopeLoading,
    scopeLabel,
    isCoordinator: authority.isCoordinator,
    positionLevel: positionScopeLevel(authority.position),
    canCreateAt,
  };
}
