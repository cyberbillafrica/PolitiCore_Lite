"use client";

/*
 * ============================================================
 * ELECTORAL NAME LOOKUP
 * ============================================================
 *
 * Resolves the names of a member's registered electoral area
 * (LGA / ward / polling unit) from the LIVE, state-wide
 * `electoral_data/enugu-state` document via `getAllEnuguLGAs()`.
 *
 * The synchronous helpers in `@/lib/constants` only know the
 * bundled single-LGA dataset, so any member registered outside
 * that dataset rendered raw ids or "Not set". This hook loads
 * the full hierarchy once (shared module cache) and hands every
 * caller pure resolvers with a "Not assigned" fallback — never
 * an empty string or `undefined` leaking into the UI.
 *
 * No LGA is hardcoded here: the seeded document is the source
 * of truth and `getAllEnuguLGAs()` carries its own offline
 * fallback.
 */

import { useEffect, useState } from "react";

import { getAllEnuguLGAs } from "@/lib/firebase/electoral";
import { deriveLgaIdFromWard } from "@/lib/election-scope";

import type { LGA, PollingUnit, Ward } from "@/types";

export const NOT_ASSIGNED = "Not assigned";

let cachedLgas: LGA[] | null = null;
let inFlight: Promise<LGA[]> | null = null;
const listeners = new Set<() => void>();

function ensureLoaded(): Promise<LGA[]> {
  if (cachedLgas) return Promise.resolve(cachedLgas);

  if (!inFlight) {
    inFlight = getAllEnuguLGAs()
      .then((next) => {
        cachedLgas = next;
        for (const notify of listeners) notify();
        return next;
      })
      .catch((err: unknown) => {
        console.error("Failed to load electoral hierarchy:", err);
        return [];
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}

export interface ElectoralLocationLabels {
  lga: LGA | null;
  ward: Ward | null;
  pollingUnit: PollingUnit | null;

  lgaLabel: string;
  wardLabel: string;
  pollingUnitLabel: string;
}

export interface ElectoralLookup {
  /** The full state-wide LGA list (empty until loaded). */
  lgas: LGA[];
  ready: boolean;

  lgaById(lgaId?: string | null): LGA | null;
  wardById(wardId?: string | null): Ward | null;
  pollingUnitById(
    wardId?: string | null,
    pollingUnitId?: string | null,
  ): PollingUnit | null;

  /** "Nkanu West (LGA)" style label, or "Not assigned". */
  lgaLabel(lgaId?: string | null, wardId?: string | null): string;
  /** "WR-01 — Amechi Ward" style label, or "Not assigned". */
  wardLabel(wardId?: string | null): string;
  /** "PU-001 — Central School" style label, or "Not assigned". */
  pollingUnitLabel(
    wardId?: string | null,
    pollingUnitId?: string | null,
  ): string;

  describe(
    lgaId?: string | null,
    wardId?: string | null,
    pollingUnitId?: string | null,
  ): ElectoralLocationLabels;
}

function findWard(lgas: LGA[], wardId?: string | null): {
  lga: LGA | null;
  ward: Ward | null;
} {
  if (!wardId) return { lga: null, ward: null };

  for (const lga of lgas) {
    const ward = lga.wards.find((item) => item.id === wardId);
    if (ward) return { lga, ward };
  }

  return { lga: null, ward: null };
}

export function useElectoralLookup(): ElectoralLookup {
  const [lgas, setLgas] = useState<LGA[]>(cachedLgas ?? []);
  const [ready, setReady] = useState(cachedLgas !== null);

  useEffect(() => {
    let mounted = true;

    const notify = () => {
      if (!mounted) return;
      setLgas(cachedLgas ?? []);
      setReady(cachedLgas !== null);
    };

    listeners.add(notify);
    ensureLoaded().then(notify);

    return () => {
      mounted = false;
      listeners.delete(notify);
    };
  }, []);

  /*
   * Every resolver is a closure (never `this`-based) so callers may
   * destructure them freely.
   */
  const lgaById = (lgaId?: string | null): LGA | null => {
    if (!lgaId) return null;
    const normalized = lgaId.toLowerCase();
    return (
      lgas.find(
        (item) =>
          item.id.toLowerCase() === normalized ||
          item.id.toLowerCase() === normalized.replace(/-lga$/, "") ||
          `${item.id.toLowerCase()}-lga` === normalized,
      ) ?? null
    );
  };

  const wardById = (wardId?: string | null): Ward | null =>
    findWard(lgas, wardId).ward;

  const pollingUnitById = (
    wardId?: string | null,
    pollingUnitId?: string | null,
  ): PollingUnit | null => {
    if (!pollingUnitId) return null;
    const ward = findWard(lgas, wardId).ward;
    return ward?.pollingUnits.find((item) => item.id === pollingUnitId) ?? null;
  };

  const wardLabel = (wardId?: string | null): string => {
    const ward = findWard(lgas, wardId).ward;
    return ward
      ? `${ward.code} — ${ward.name}`
      : wardId
        ? wardId
        : NOT_ASSIGNED;
  };

  const pollingUnitLabel = (
    wardId?: string | null,
    pollingUnitId?: string | null,
  ): string => {
    const pu = pollingUnitById(wardId, pollingUnitId);
    return pu
      ? `${pu.code} — ${pu.name}`
      : pollingUnitId
        ? pollingUnitId
        : NOT_ASSIGNED;
  };

  const lgaLabel = (lgaId?: string | null, wardId?: string | null): string => {
    const direct = lgaById(lgaId);
    if (direct) return direct.name;

    // Fall back to the LGA that owns the ward — no id ever
    // resolves to a hardcoded LGA.
    const derivedId = deriveLgaIdFromWard(lgas, wardId);
    const derived = derivedId ? lgaById(derivedId) : null;
    return derived ? derived.name : NOT_ASSIGNED;
  };

  const describe = (
    lgaId?: string | null,
    wardId?: string | null,
    pollingUnitId?: string | null,
  ): ElectoralLocationLabels => {
    const { lga: wardLga, ward } = findWard(lgas, wardId);
    const resolvedLga = lgaById(lgaId) ?? (wardLga ? lgaById(wardLga.id) : null);

    return {
      lga: resolvedLga,
      ward,
      pollingUnit:
        ward?.pollingUnits.find((item) => item.id === pollingUnitId) ?? null,
      lgaLabel: lgaLabel(lgaId, wardId),
      wardLabel: wardLabel(wardId),
      pollingUnitLabel: pollingUnitLabel(wardId, pollingUnitId),
    };
  };

  return {
    lgas,
    ready,
    lgaById,
    wardById,
    pollingUnitById,
    lgaLabel,
    wardLabel,
    pollingUnitLabel,
    describe,
  };
}
