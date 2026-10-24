import { describe, expect, it } from "vitest";

import {
  SCOPE_LEVEL_ORDER,
  scopeContainsTarget,
  scopeIdsByLevel,
  scopeLevels,
  stateWideScope,
  stateWideScopes,
  writableScopes,
} from "@/lib/campaign-scope-options";
import { resolveCampaignScope } from "@/lib/campaign-scope";
import { viewerGrants } from "@/lib/campaign-read-scope";

import {
  LGAS,
  LGA,
  PU_001,
  PU_002,
  WARD_01,
  WARD_02,
  ZONE,
  OTHER_LGA,
  OTHER_WARD,
  OTHER_PU,
} from "./helpers";

import type { OrganizationalPosition, ScopeType } from "@/types";

/*
 * ============================================================
 * SCOPE OPTIONS — ROUND 8 FIX 2B / FIX 4
 * ============================================================
 *
 * The assignment target picker and the issues filter must offer ONLY
 * scopes the caller's grants cover. Both derive their options from the
 * same pure function, which expands each grant to its own scope and
 * everything below it — the shape the campaign projection writes.
 *
 * The grants below come from `viewerGrants()`, so the test exercises the
 * exact list the app computes from the profile + active assignment.
 */

const profile = (pollingUnitId: string, wardId: string, lgaId: string) => ({
  access_role: "member",
  membership_types: ["campaign_member"],
  polling_unit_id: pollingUnitId,
  ward_id: wardId,
  lga_id: lgaId,
});

const POSITION_BY_SCOPE: Record<ScopeType, OrganizationalPosition> = {
  campaign: "state_coordinator",
  state: "state_coordinator",
  senatorial_zone: "zone_coordinator",
  lga: "lga_coordinator",
  ward: "ward_coordinator",
  polling_unit: "pu_coordinator",
};

function grantsFor(
  scopeType: ScopeType,
  scopeId: string,
  area = { pu: PU_001, ward: WARD_01, lga: LGA },
) {
  return viewerGrants({
    userId: "viewer",
    profile: profile(area.pu, area.ward, area.lga),
    assignments: [
      {
        position: POSITION_BY_SCOPE[scopeType],
        scope_type: scopeType,
        scope_id: scopeId,
        status: "active",
      },
    ],
    lgas: LGAS,
  });
}

const keys = (options: { level: string; scope_id: string }[]) =>
  options.map((option) => `${option.level}:${option.scope_id}`);

describe("grant-derived scope options", () => {
  it("a PU coordinator can only target their own polling unit", () => {
    const options = writableScopes(
      grantsFor("polling_unit", PU_001),
      "create_assignment",
      LGAS,
    );

    expect(keys(options)).toEqual([`polling_unit:${PU_001}`]);
    expect(scopeLevels(options)).toEqual(["polling_unit"]);
  });

  it("a ward coordinator can target their ward and each PU inside it", () => {
    const options = writableScopes(
      grantsFor("ward", WARD_01),
      "create_assignment",
      LGAS,
    );

    expect(scopeLevels(options)).toEqual(["ward", "polling_unit"]);
    expect(keys(options)).toEqual([
      `ward:${WARD_01}`,
      `polling_unit:${PU_001}`,
      `polling_unit:${PU_002}`,
    ]);
  });

  it("an LGA coordinator can target the LGA, its wards and their PUs — nothing above", () => {
    const options = writableScopes(
      grantsFor("lga", LGA),
      "create_assignment",
      LGAS,
    );

    expect(scopeLevels(options)).toEqual(["lga", "ward", "polling_unit"]);

    expect(keys(options)).toContain(`lga:${LGA}`);
    expect(keys(options)).toContain(`ward:${WARD_02}`);
    expect(keys(options)).toContain(`polling_unit:${PU_002}`);

    /* Nothing above the LGA. */
    expect(options.some((option) => option.level === "state")).toBe(false);
    expect(
      options.some((option) => option.level === "senatorial_zone"),
    ).toBe(false);

    /* Nothing outside the LGA. */
    expect(keys(options)).not.toContain(`ward:${OTHER_WARD}`);
  });

  it("a zone coordinator can target the zone and everything inside it", () => {
    const options = writableScopes(
      grantsFor("senatorial_zone", ZONE),
      "create_assignment",
      LGAS,
    );

    expect(scopeLevels(options)).toEqual([
      "senatorial_zone",
      "lga",
      "ward",
      "polling_unit",
    ]);

    expect(keys(options)).toContain(`senatorial_zone:${ZONE}`);
    expect(keys(options)).toContain(`lga:${LGA}`);
    expect(keys(options)).toContain(`ward:${WARD_01}`);

    /* nsukka is in the OTHER zone. */
    expect(keys(options)).not.toContain(`lga:${OTHER_LGA}`);
  });

  it("a state coordinator can target the whole state", () => {
    const options = writableScopes(
      grantsFor("state", "enugu-state"),
      "create_assignment",
      LGAS,
    );

    expect(scopeLevels(options)).toEqual(SCOPE_LEVEL_ORDER);
    expect(keys(options)).toContain(`lga:${OTHER_LGA}`);
    expect(keys(options)).toContain(`polling_unit:${OTHER_PU}`);
  });

  it("a plain campaign member has no assignable scope", () => {
    const grants = viewerGrants({
      userId: "member",
      profile: profile(PU_001, WARD_01, LGA),
      assignments: [],
      lgas: LGAS,
    });

    expect(writableScopes(grants, "create_assignment", LGAS)).toEqual([]);
    expect(writableScopes(grants, "manage_issue", LGAS)).toEqual([]);
  });

  it("an admin sees the full state unconditionally", () => {
    const options = stateWideScopes(LGAS);

    expect(scopeLevels(options)).toEqual(SCOPE_LEVEL_ORDER);
    expect(keys(options)).toContain("state:enugu-state");
    expect(keys(options)).toContain(`lga:${LGA}`);
    expect(keys(options)).toContain(`ward:${OTHER_WARD}`);
    expect(keys(options)).toContain(`polling_unit:${OTHER_PU}`);
  });

  it("reports the same ids it offers, per level", () => {
    const options = writableScopes(
      grantsFor("ward", WARD_01),
      "manage_issue",
      LGAS,
    );

    expect(scopeIdsByLevel(options)).toEqual({
      ward: [WARD_01],
      polling_unit: [PU_001, PU_002],
    });
  });
});

describe("in-memory scope narrowing", () => {
  const resolve = (level: ScopeType, id: string) =>
    resolveCampaignScope(level, id, LGAS);

  it("a ward filter includes its own and its polling units' issues", async () => {
    const ward = await resolve("ward", WARD_01);

    expect(scopeContainsTarget(ward, "ward", WARD_01)).toBe(true);
    expect(scopeContainsTarget(ward, "polling_unit", PU_001)).toBe(true);
    expect(scopeContainsTarget(ward, "polling_unit", PU_002)).toBe(true);

    expect(scopeContainsTarget(ward, "ward", WARD_02)).toBe(false);
    expect(scopeContainsTarget(ward, "polling_unit", OTHER_PU)).toBe(false);
  });

  it("an LGA filter includes every ward and PU beneath it", async () => {
    const lga = await resolve("lga", LGA);

    expect(scopeContainsTarget(lga, "lga", LGA)).toBe(true);
    expect(scopeContainsTarget(lga, "ward", WARD_02)).toBe(true);
    expect(scopeContainsTarget(lga, "polling_unit", PU_002)).toBe(true);

    expect(scopeContainsTarget(lga, "lga", OTHER_LGA)).toBe(false);
    expect(scopeContainsTarget(lga, "senatorial_zone", ZONE)).toBe(false);
  });

  it("the state scope contains everything, and no filter means everything", async () => {
    const state = stateWideScope(LGAS);

    expect(scopeContainsTarget(state, "ward", OTHER_WARD)).toBe(true);
    expect(scopeContainsTarget(state, "polling_unit", OTHER_PU)).toBe(true);
    expect(scopeContainsTarget(null, "polling_unit", OTHER_PU)).toBe(true);
  });
});
