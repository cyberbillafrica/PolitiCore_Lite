"use client";

/*
 * ============================================================
 * ELECTION ENGINE HOOKS
 * ============================================================
 *
 * These hooks are the client-side face of the election scope
 * model. They subscribe to the single `election_settings`
 * document and expose:
 *
 *   useElectionSettings() -> the raw settings document (live)
 *   useElectionMode()     -> the master ON/OFF switch
 *   useActiveContest()    -> the active contest + its scope
 *
 * The documented scope model lives in `src/lib/election-scope.ts`.
 * Everything that needs a geographic boundary should read the
 * active contest from here rather than assuming an LGA.
 *
 * The election mode flag defaults to ON when the settings document
 * (or the field inside it) does not exist, so a fresh deployment is
 * never locked out of its own election surfaces.
 */

import { useEffect, useState } from "react";

import { getContest, subscribeToElectionSettings } from "@/lib/firebase/election";
import { resolveContestLgaIds } from "@/lib/election-scope";
import type { ElectionContest, ElectionSettings } from "@/types";

export interface ElectionSettingsResult {
  settings: ElectionSettings | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Live subscription to the single election settings document.
 */
export function useElectionSettings(): ElectionSettingsResult {
  const [settings, setSettings] = useState<ElectionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToElectionSettings(
      (next) => {
        setSettings(next);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to subscribe to election settings:", err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  return { settings, loading, error };
}

/**
 * The master election mode switch.
 *
 * `undefined` (field absent) counts as enabled.
 */
export function useElectionMode(): {
  electionMode: boolean;
  settings: ElectionSettings | null;
  loading: boolean;
} {
  const { settings, loading } = useElectionSettings();

  return {
    electionMode: settings?.election_mode_enabled !== false,
    settings,
    loading,
  };
}

export interface ActiveContestResult {
  settings: ElectionSettings | null;
  contest: ElectionContest | null;
  /**
   * The LGA ids the active contest is restricted to, or `null` when
   * the contest is state-wide / national.
   */
  lgaIds: string[] | null;
  loading: boolean;
}

/**
 * Resolve the active contest (and therefore the operational scope)
 * from `election_settings.active_contest_id`.
 */
export function useActiveContest(): ActiveContestResult {
  const { settings, loading: settingsLoading } = useElectionSettings();

  const [contest, setContest] = useState<ElectionContest | null>(null);
  const [contestLoading, setContestLoading] = useState(true);

  const activeContestId = settings?.active_contest_id ?? null;

  useEffect(() => {
    if (settingsLoading) return;

    if (!activeContestId) {
      setContest(null);
      setContestLoading(false);
      return;
    }

    let cancelled = false;
    setContestLoading(true);

    getContest(activeContestId)
      .then((next) => {
        if (cancelled) return;
        setContest(next);
        setContestLoading(false);
      })
      .catch((err: unknown) => {
        console.error("Failed to load the active election contest:", err);
        if (cancelled) return;
        setContest(null);
        setContestLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeContestId, settingsLoading]);

  return {
    settings,
    contest,
    lgaIds: resolveContestLgaIds(contest),
    loading: settingsLoading || contestLoading,
  };
}
