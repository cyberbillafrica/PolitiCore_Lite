"use client";

/*
 * ============================================================
 * SCOPE PICKER — ONE COMPONENT, SIX CALL SITES
 * ============================================================
 *
 * Used by:
 *
 *   1. Admin Coordination (assign a position)
 *   2. Admin member add / edit (home ward and polling unit)
 *   3. Assignment creation (target scope)
 *   4. Activity creation (admin scope)
 *   5. Reports page (admin scope filter)
 *   6. Activities page (admin scope filter)
 *
 * Behaviour:
 *
 *   Level select ............ State / Zone / LGA / Ward / PU
 *   Cascade ................. Ward needs an LGA; PU needs LGA + ward
 *   Search .................. filters the final list by name AND code
 *   Duplicate ward names .... prefixed with their LGA name
 *   Resolved id ............. shown as small grey text under the picker
 *
 * Every value is the exact id the rest of the system stores:
 *
 *   enugu-state | enugu-east | nkanu-west | nkanu-west-ward-03 |
 *   nkanu-west-ward-03-pu-001
 *
 * This component is deliberately the ONLY place that vocabulary is
 * assembled into options. Do not copy it into a page.
 */

import { useEffect, useMemo, useState } from "react";

import { MapPin, Search } from "lucide-react";

import { useElectoralLookup } from "@/hooks/useElectoralLookup";

import { ZONE_IDS, zoneLabel } from "@/lib/campaign-scope";

import type { LGA, ScopeType } from "@/types";

export interface ScopeValue {
  level: ScopeType;
  scope_id: string;
}

export interface ScopePickerProps {
  value: ScopeValue | null;
  onChange: (next: ScopeValue | null) => void;

  /** Levels offered. Defaults to the full hierarchy. */
  levels?: ScopeType[];

  /** Adds an "All scopes" option that resolves to `null`. */
  allowAll?: boolean;
  allLabel?: string;

  label?: string;
  hint?: string;
  disabled?: boolean;

  /** Stable prefix for input ids / labels. */
  idPrefix: string;

  /** Render the resolved id under the picker. Default true. */
  showResolvedId?: boolean;

  /**
   * Restrict every offered value to these exact ids per level.
   *
   * Used where the caller's authority is narrower than the state
   * (a scoped coordinator creating an assignment or filtering issues):
   * the pickers then cannot offer a value the rules would reject. The
   * LGA / ward cascades are limited to the areas that CONTAIN an
   * allowed value.
   */
  scopeIds?: Partial<Record<ScopeType, string[]>>;
}

const DEFAULT_LEVELS: ScopeType[] = [
  "state",
  "senatorial_zone",
  "lga",
  "ward",
  "polling_unit",
];

const LEVEL_LABELS: Record<ScopeType, string> = {
  campaign: "Campaign",
  state: "State",
  senatorial_zone: "Senatorial Zone",
  lga: "LGA",
  ward: "Ward",
  polling_unit: "Polling Unit",
};

interface Option {
  id: string;
  label: string;
  /** Secondary text, matched by the search box. */
  code?: string;
}

/** Ward names that exist in more than one LGA need disambiguation. */
function duplicateWardNames(lgas: LGA[]): Set<string> {
  const counts = new Map<string, number>();

  for (const lga of lgas) {
    for (const ward of lga.wards) {
      const key = ward.name.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const duplicates = new Set<string>();
  for (const [name, count] of counts) {
    if (count > 1) duplicates.add(name);
  }

  return duplicates;
}

function numberFromCode(code: string): string {
  return code.replace(/\D+/g, "");
}

export default function ScopePicker({
  value,
  onChange,
  levels = DEFAULT_LEVELS,
  allowAll = false,
  allLabel = "All scopes",
  label = "Scope",
  hint,
  disabled = false,
  idPrefix,
  showResolvedId = true,
  scopeIds,
}: ScopePickerProps) {
  const lookup = useElectoralLookup();
  const lgas = lookup.lgas;

  const duplicates = useMemo(() => duplicateWardNames(lgas), [lgas]);

  /*
   * R8 — authority clamp. The cascade dropdowns only list the LGAs and
   * wards that contain a value the caller is allowed to pick.
   */
  const cascadeLgas = useMemo(() => {
    if (!scopeIds) return lgas;

    const ids = new Set<string>();

    for (const id of scopeIds.lga ?? []) ids.add(id);

    for (const id of scopeIds.ward ?? []) {
      const lga = lgas.find((item) =>
        item.wards.some((ward) => ward.id === id),
      );
      if (lga) ids.add(lga.id);
    }

    for (const id of scopeIds.polling_unit ?? []) {
      for (const lga of lgas) {
        if (
          lga.wards.some((ward) =>
            ward.pollingUnits.some((unit) => unit.id === id),
          )
        ) {
          ids.add(lga.id);
        }
      }
    }

    return ids.size === 0 ? lgas : lgas.filter((lga) => ids.has(lga.id));
  }, [lgas, scopeIds]);

  const cascadeWardIds = useMemo(() => {
    if (!scopeIds) return null;

    const ids = new Set(scopeIds.ward ?? []);

    for (const id of scopeIds.polling_unit ?? []) {
      for (const lga of lgas) {
        const ward = lga.wards.find((item) =>
          item.pollingUnits.some((unit) => unit.id === id),
        );
        if (ward) ids.add(ward.id);
      }
    }

    return ids;
  }, [lgas, scopeIds]);

  const [level, setLevel] = useState<ScopeType | "">(value?.level ?? "");
  const [search, setSearch] = useState("");
  const [lgaId, setLgaId] = useState("");
  const [wardId, setWardId] = useState("");

  /*
   * Keep the cascade in step with an externally-set value (edit forms,
   * reset buttons) without fighting the user's own changes.
   */
  useEffect(() => {
    if (!value) return;

    setLevel(value.level);

    if (value.level === "polling_unit") {
      for (const lga of lgas) {
        for (const ward of lga.wards) {
          if (ward.pollingUnits.some((pu) => pu.id === value.scope_id)) {
            setLgaId(lga.id);
            setWardId(ward.id);
            return;
          }
        }
      }
      return;
    }

    if (value.level === "ward") {
      for (const lga of lgas) {
        if (lga.wards.some((ward) => ward.id === value.scope_id)) {
          setLgaId(lga.id);
          setWardId(value.scope_id);
          return;
        }
      }
    }

    if (value.level === "lga") {
      setLgaId(value.scope_id);
    }
  }, [value, lgas]);

  /* ------------------------------------------------------------
   * OPTIONS
   * ------------------------------------------------------------ */

  const options = useMemo<Option[]>(() => {
    const all: Option[] = (() => {
      switch (level) {
        case "state":
        case "campaign":
          return [{ id: "enugu-state", label: "Enugu State", code: "EN" }];

        case "senatorial_zone":
          return ZONE_IDS.map((id) => ({
            id,
            label: zoneLabel(id),
            code: id,
          }));

        case "lga":
          return lgas.map((lga) => ({
            id: lga.id,
            label: `${lga.name} LGA`,
            code: `${lga.code} ${lga.id}`,
          }));

        case "ward": {
          const source = lgaId
            ? lgas.filter((lga) => lga.id === lgaId)
            : lgas;

          return source.flatMap((lga) =>
            lga.wards.map((ward) => {
              const needsPrefix = duplicates.has(
                ward.name.trim().toLowerCase(),
              );

              return {
                id: ward.id,
                label: needsPrefix
                  ? `${lga.name} — ${ward.name}`
                  : ward.name,
                code: `${ward.code} ${ward.id}`,
              };
            }),
          );
        }

        case "polling_unit": {
          const source = lgaId
            ? lgas.filter((lga) => lga.id === lgaId)
            : lgas;

          return source.flatMap((lga) =>
            lga.wards
              .filter((ward) => !wardId || ward.id === wardId)
              .flatMap((ward) =>
                ward.pollingUnits.map((pu) => ({
                  id: pu.id,
                  label: `PU ${numberFromCode(pu.code) || pu.code} — ${
                    pu.name
                  }`,
                  code: `${pu.code} ${ward.name} ${lga.name}`,
                })),
              ),
          );
        }

        default:
          return [];
      }
    })();

    const allowed = level ? scopeIds?.[level as ScopeType] : undefined;

    return allowed
      ? all.filter((option) => allowed.includes(option.id))
      : all;
  }, [duplicates, lgaId, lgas, level, scopeIds, wardId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return options;

    return options.filter((option) =>
      `${option.label} ${option.code ?? ""} ${option.id}`
        .toLowerCase()
        .includes(term),
    );
  }, [options, search]);

  const selected = value && value.level === level ? value.scope_id : "";

  /* ------------------------------------------------------------
   * HANDLERS
   * ------------------------------------------------------------ */

  function changeLevel(next: ScopeType | "") {
    setLevel(next);
    setSearch("");
    setLgaId("");
    setWardId("");

    if (!next) {
      onChange(allowAll ? null : { level: "state", scope_id: "enugu-state" });
      return;
    }

    /*
     * Fixed levels resolve immediately — the admin never has to pick
     * from a list of one.
     */
    if (next === "state" || next === "campaign") {
      onChange({ level: next, scope_id: "enugu-state" });
      return;
    }

    onChange(null);
  }

  function selectOption(id: string) {
    if (!level) return;
    onChange({ level, scope_id: id });
  }

  const needsLga = level === "ward" || level === "polling_unit";
  const needsWard = level === "polling_unit";
  const searchable =
    level === "lga" || level === "ward" || level === "polling_unit";

  const resolvedLabel =
    value && value.scope_id
      ? options.find((option) => option.id === value.scope_id)?.label ?? ""
      : "";

  /* ------------------------------------------------------------
   * RENDER
   * ------------------------------------------------------------ */

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor={`${idPrefix}-level`}
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          {label}
        </label>

        <select
          id={`${idPrefix}-level`}
          value={level}
          disabled={disabled}
          onChange={(event) =>
            changeLevel(event.target.value as ScopeType | "")
          }
          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary disabled:cursor-not-allowed disabled:bg-gray-50"
        >
          {allowAll && <option value="">{allLabel}</option>}

          {!allowAll && <option value="">Select a level…</option>}

          {levels.map((item) => (
            <option key={item} value={item}>
              {LEVEL_LABELS[item]}
            </option>
          ))}
        </select>
      </div>

      {searchable && (
        <div>
          <label
            htmlFor={`${idPrefix}-search`}
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            Search
          </label>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <input
              id={`${idPrefix}-search`}
              value={search}
              disabled={disabled}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or code…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm outline-none focus:border-apc-primary disabled:bg-gray-50"
            />
          </div>
        </div>
      )}

      {needsLga && (
        <div>
          <label
            htmlFor={`${idPrefix}-lga`}
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            LGA
          </label>

          <select
            id={`${idPrefix}-lga`}
            value={lgaId}
            disabled={disabled}
            onChange={(event) => {
              setLgaId(event.target.value);
              setWardId("");
              onChange(null);
            }}
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary disabled:bg-gray-50"
          >
            <option value="">All LGAs</option>

            {cascadeLgas.map((lga) => (
              <option key={lga.id} value={lga.id}>
                {lga.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {needsWard && (
        <div>
          <label
            htmlFor={`${idPrefix}-ward`}
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            Ward
          </label>

          <select
            id={`${idPrefix}-ward`}
            value={wardId}
            disabled={disabled}
            onChange={(event) => {
              setWardId(event.target.value);
              onChange(null);
            }}
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary disabled:bg-gray-50"
          >
            <option value="">All wards</option>

            {(lgaId ? lgas.filter((lga) => lga.id === lgaId) : lgas).flatMap(
              (lga) =>
                lga.wards
                  .filter(
                    (ward) =>
                      !cascadeWardIds ||
                      cascadeWardIds.size === 0 ||
                      cascadeWardIds.has(ward.id),
                  )
                  .map((ward) => (
                    <option key={ward.id} value={ward.id}>
                      {duplicates.has(ward.name.trim().toLowerCase())
                        ? `${lga.name} — ${ward.name}`
                        : ward.name}
                    </option>
                  )),
            )}
          </select>
        </div>
      )}

      {(level === "senatorial_zone" || level === "lga" || needsLga) && (
        <div>
          <label
            htmlFor={`${idPrefix}-value`}
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            {level === "senatorial_zone" ? "Zone" : LEVEL_LABELS[level]}
          </label>

          <select
            id={`${idPrefix}-value`}
            value={selected}
            disabled={disabled || filtered.length === 0}
            onChange={(event) => selectOption(event.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-apc-primary disabled:bg-gray-50"
          >
            <option value="">
              {filtered.length === 0
                ? "No matches — adjust the search"
                : `Select a ${LEVEL_LABELS[level].toLowerCase()}…`}
            </option>

            {filtered.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {showResolvedId && value?.scope_id && (
        <p className="flex items-center gap-1.5 text-xs text-gray-400">
          <MapPin className="h-3 w-3 shrink-0" />

          <span className="truncate">
            {resolvedLabel ? `${resolvedLabel} · ` : ""}
            <code className="font-mono">{value.scope_id}</code>
          </span>
        </p>
      )}

      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
