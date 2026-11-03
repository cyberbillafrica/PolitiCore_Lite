import { describe, expect, it } from "vitest";

import {
  aggregatePartyVotes,
  countApprovedPollingUnits,
  countDiscrepanciesInScope,
  filterApprovedResultsForMetrics,
  filterResultsByGeographicScope,
  isResultInGeographicScope,
  scopeCompletionTotals,
  type MetricsResultInput,
} from "@/lib/election-metrics";
import {
  countApprovedByLevel,
  countHierarchyTargets,
} from "@/lib/election-levels";
import type { EnuguStateElectoralData, LGA } from "@/types";

/*
 * Round 16C — the geographic filter must bound EVERY dashboard metric.
 *
 * Hierarchy (20 PUs, 4 wards, 2 LGAs):
 *
 *   nkanu-west
 *     ward-01 .......... 5 PUs
 *     ward-02 .......... 3 PUs
 *     ward-03 (Akegbe) . 7 PUs
 *   nkanu-east
 *     ward-04 .......... 5 PUs
 *
 * Each approved PU records APC 10 / PDP 4, so the expected aggregates
 * are easy to state per slice. Pure logic only: no emulator.
 */

const CONTEST = "contest-1";
const STATE = "enugu-state";

function makeWard(id: string, name: string, puCount: number) {
  return {
    id,
    code: id.toUpperCase(),
    name,
    pollingUnits: Array.from({ length: puCount }, (_, index) => ({
      id: `${id}-pu-${String(index + 1).padStart(3, "0")}`,
      code: String(index + 1).padStart(3, "0"),
      name: `${name} PU ${index + 1}`,
    })),
  };
}

const LGAS: LGA[] = [
  {
    id: "nkanu-west",
    code: "NW",
    name: "Nkanu West",
    wards: [
      makeWard("nkanu-west-ward-01", "Ward 01", 5),
      makeWard("nkanu-west-ward-02", "Ward 02", 3),
      makeWard("nkanu-west-ward-03", "Akegbe", 7),
    ],
  },
  {
    id: "nkanu-east",
    code: "NE",
    name: "Nkanu East",
    wards: [makeWard("nkanu-east-ward-04", "Ward 04", 5)],
  },
];

const HIERARCHY: EnuguStateElectoralData = { state: "Enugu State", lgas: LGAS };
const AKEGBE = "nkanu-west-ward-03";

function lgaForWard(wardId: string): string {
  const lga = LGAS.find((item) =>
    item.wards.some((ward) => ward.id === wardId),
  );
  if (!lga) throw new Error(`unknown ward ${wardId}`);
  return lga.id;
}

function puResult(
  wardId: string,
  pollingUnitId: string,
  overrides: Partial<MetricsResultInput> = {},
): MetricsResultInput {
  return {
    contest_id: CONTEST,
    result_level: "polling_unit",
    status: "approved",
    ward_id: wardId,
    lga_id: lgaForWard(wardId),
    state_id: STATE,
    polling_unit_id: pollingUnitId,
    results: [
      { party: "APC", votes: 10 },
      { party: "PDP", votes: 4 },
    ],
    ...overrides,
  };
}

function allApprovedPus(): MetricsResultInput[] {
  return LGAS.flatMap((lga) =>
    lga.wards.flatMap((ward) =>
      ward.pollingUnits.map((unit) => puResult(ward.id, unit.id)),
    ),
  );
}

function collation(
  level: "ward" | "lga" | "state",
  scope: { wardId?: string; lgaId?: string; stateId?: string },
  votes: Array<{ party: string; votes: number }>,
  overrides: Partial<MetricsResultInput> = {},
): MetricsResultInput {
  return {
    contest_id: CONTEST,
    result_level: level,
    status: "approved",
    polling_unit_id: "",
    ward_id: scope.wardId ?? "",
    lga_id: scope.lgaId ?? "",
    state_id: scope.stateId ?? STATE,
    results: votes,
    ...overrides,
  };
}

function stripFixture(): MetricsResultInput[] {
  return [
    ...allApprovedPus(),
    collation("ward", { wardId: "nkanu-west-ward-01", lgaId: "nkanu-west" }, [
      { party: "APC", votes: 50 },
      { party: "PDP", votes: 20 },
    ]),
    collation("ward", { wardId: "nkanu-west-ward-02", lgaId: "nkanu-west" }, [
      { party: "APC", votes: 30 },
      { party: "PDP", votes: 12 },
    ]),
    /* Akegbe is the one intended mismatch: APC 75 vs 7 PUs x 10 = 70. */
    collation("ward", { wardId: AKEGBE, lgaId: "nkanu-west" }, [
      { party: "APC", votes: 75 },
      { party: "PDP", votes: 28 },
    ]),
    collation("ward", { wardId: "nkanu-east-ward-04", lgaId: "nkanu-east" }, [
      { party: "APC", votes: 50 },
      { party: "PDP", votes: 20 },
    ]),
    collation("lga", { lgaId: "nkanu-west" }, [{ party: "APC", votes: 999 }]),
    collation("lga", { lgaId: "nkanu-east" }, [{ party: "APC", votes: 999 }]),
    collation("state", {}, [{ party: "APC", votes: 5000 }]),
  ];
}

function metricsFor(
  results: MetricsResultInput[],
  selectedLgaId = "all",
  selectedWardId = "all",
  contestId: string | null = CONTEST,
) {
  const filtered = filterApprovedResultsForMetrics(results, {
    contestId,
    selectedLgaId,
    selectedWardId,
    lgas: LGAS,
  });
  const totals = scopeCompletionTotals({
    totals: countHierarchyTargets(LGAS),
    selectedLgaId,
    selectedWardId,
    lgas: LGAS,
  });
  const aggregate = aggregatePartyVotes(filtered, ["APC", "PDP"]);

  return {
    filtered,
    totals,
    approved: countApprovedPollingUnits(filtered),
    ...aggregate,
  };
}

function expectInternallyConsistent(
  metrics: ReturnType<typeof metricsFor>,
): void {
  const partySum = Object.values(metrics.partyTotals).reduce(
    (sum, value) => sum + value,
    0,
  );
  expect(metrics.totalVotes).toBe(partySum);
  expect(metrics.approved).toBeLessThanOrEqual(metrics.totals.polling_unit);
  expect(
    metrics.filtered.every(
      (result) =>
        result.status === "approved" &&
        (result.result_level ?? "polling_unit") === "polling_unit",
    ),
  ).toBe(true);
}

describe("filterApprovedResultsForMetrics", () => {
  const results = allApprovedPus();

  it("uses every approved PU without a filter", () => {
    const metrics = metricsFor(results);

    expect(metrics.approved).toBe(20);
    expect(metrics.totals.polling_unit).toBe(20);
    expect(metrics.totalVotes).toBe(280);
    expect(metrics.partyTotals.apc).toBe(200);
    expect(metrics.partyTotals.pdp).toBe(80);
    expect(metrics.partyTotals.apc - metrics.partyTotals.pdp).toBe(120);
    expectInternallyConsistent(metrics);
  });

  it("narrows every aggregate to the selected LGA", () => {
    const metrics = metricsFor(results, "nkanu-west");

    expect(metrics.approved).toBe(15);
    expect(metrics.totals.polling_unit).toBe(15);
    expect(metrics.totalVotes).toBe(210);
    expect(metrics.partyTotals.apc).toBe(150);
    expect(metrics.partyTotals.pdp).toBe(60);
    expect(metrics.partyTotals.apc - metrics.partyTotals.pdp).toBe(90);
    expectInternallyConsistent(metrics);
  });

  it("narrows the numerator and every vote metric to Akegbe", () => {
    const metrics = metricsFor(results, "nkanu-west", AKEGBE);

    expect(metrics.approved).toBe(7);
    expect(metrics.totals.polling_unit).toBe(7);
    expect(metrics.totalVotes).toBe(98);
    expect(metrics.partyTotals.apc).toBe(70);
    expect(metrics.partyTotals.pdp).toBe(28);
    expect(metrics.partyTotals.apc - metrics.partyTotals.pdp).toBe(42);
    expectInternallyConsistent(metrics);
  });

  it("cannot report more approved PUs than the denominator", () => {
    const metrics = metricsFor(results, "nkanu-west", AKEGBE);

    /* The old bug: 10 / 7, i.e. 142% coverage. */
    expect(metrics.approved).toBe(metrics.totals.polling_unit);
    expect(metrics.approved).toBeLessThanOrEqual(metrics.totals.polling_unit);
  });

  it("returns a clean zero state for a ward with no approvals", () => {
    const withoutEast = results.filter(
      (result) => result.ward_id !== "nkanu-east-ward-04",
    );
    const metrics = metricsFor(withoutEast, "nkanu-east", "nkanu-east-ward-04");

    expect(metrics.approved).toBe(0);
    expect(metrics.totals.polling_unit).toBe(5);
    expect(metrics.totalVotes).toBe(0);
    expect(metrics.partyTotals.apc).toBe(0);
    expect(metrics.partyTotals.pdp).toBe(0);
    expectInternallyConsistent(metrics);
  });

  it("reports partial coverage without exceeding the denominator", () => {
    const partial = results.filter(
      (result) =>
        result.ward_id !== AKEGBE ||
        ["nkanu-west-ward-03-pu-001", "nkanu-west-ward-03-pu-002", "nkanu-west-ward-03-pu-003"].includes(
          result.polling_unit_id ?? "",
        ),
    );
    const metrics = metricsFor(partial, "nkanu-west", AKEGBE);

    expect(metrics.approved).toBe(3);
    expect(metrics.totals.polling_unit).toBe(7);
    expect(metrics.totalVotes).toBe(42);
    expectInternallyConsistent(metrics);
  });

  it("counts duplicate documents for one PU only once", () => {
    const duplicate = [
      puResult(AKEGBE, "nkanu-west-ward-03-pu-001"),
      puResult(AKEGBE, "nkanu-west-ward-03-pu-001"),
    ];
    const metrics = metricsFor(duplicate, "nkanu-west", AKEGBE);

    expect(metrics.filtered).toHaveLength(2);
    expect(metrics.approved).toBe(1);
    expect(metrics.approved).toBeLessThanOrEqual(metrics.totals.polling_unit);
  });

  it("keeps metrics on the active contest when the dropdown says all", () => {
    const mixed = [
      ...allApprovedPus(),
      puResult(AKEGBE, "other-contest-pu", { contest_id: "contest-2" }),
    ];

    /* The page passes the active contest id when the dropdown is "all". */
    const activeOnly = metricsFor(mixed, "all", "all", CONTEST);
    expect(activeOnly.approved).toBe(20);
    expect(activeOnly.totalVotes).toBe(280);

    /* A specific dropdown selection behaves the same way. */
    const selected = metricsFor(mixed, "all", "all", "contest-2");
    expect(selected.approved).toBe(1);
    expect(selected.totalVotes).toBe(14);

    /* No active/selected contest keeps the legacy "everything" behaviour. */
    const unrestricted = metricsFor(mixed, "all", "all", null);
    expect(unrestricted.approved).toBe(21);
  });

  it("combines the contest guard with the geographic filter", () => {
    const mixed = [
      ...allApprovedPus(),
      puResult("nkanu-west-ward-01", "other-contest-pu", {
        contest_id: "contest-2",
      }),
    ];

    const metrics = metricsFor(mixed, "nkanu-west", "all", CONTEST);

    expect(metrics.approved).toBe(15);
    expect(metrics.totalVotes).toBe(210);
    expect(
      metrics.filtered.every((result) => result.contest_id === CONTEST),
    ).toBe(true);
  });
});

describe("strip counts follow the same geographic slice", () => {
  const fixture = stripFixture();

  function strip(selectedLgaId: string, selectedWardId: string) {
    const scoped = filterResultsByGeographicScope(fixture, {
      selectedLgaId,
      selectedWardId,
      lgas: LGAS,
    });
    return {
      approved: countApprovedByLevel(scoped, CONTEST),
      totals: scopeCompletionTotals({
        totals: countHierarchyTargets(LGAS),
        selectedLgaId,
        selectedWardId,
        lgas: LGAS,
      }),
    };
  }

  it("stays contest-wide when no geographic filter is set", () => {
    expect(strip("all", "all")).toEqual({
      approved: { polling_unit: 20, ward: 4, lga: 2, state: 1 },
      totals: { polling_unit: 20, ward: 4, lga: 2, state: 1 },
    });
  });

  it("narrows PU and ward counts to the selected LGA", () => {
    expect(strip("nkanu-west", "all")).toEqual({
      approved: { polling_unit: 15, ward: 3, lga: 1, state: 1 },
      totals: { polling_unit: 15, ward: 3, lga: 1, state: 1 },
    });
  });

  it("shows Akegbe as PU X/7, Ward Y/1, LGA Z/1, State W/1", () => {
    const akegbe = strip("nkanu-west", AKEGBE);

    expect(akegbe.totals).toEqual({
      polling_unit: 7,
      ward: 1,
      lga: 1,
      state: 1,
    });
    expect(akegbe.approved).toEqual({
      polling_unit: 7,
      ward: 1,
      lga: 1,
      state: 1,
    });
  });

  it("keeps the parent LGA collation visible from a ward drill-down", () => {
    /* A ward with no EC8B of its own, but an approved EC8C above it. */
    const withoutWard01Collation = fixture.filter(
      (result) =>
        !(
          (result.result_level ?? "polling_unit") === "ward" &&
          result.ward_id === "nkanu-west-ward-01"
        ),
    );
    const scoped = filterResultsByGeographicScope(withoutWard01Collation, {
      selectedLgaId: "nkanu-west",
      selectedWardId: "nkanu-west-ward-01",
      lgas: LGAS,
    });

    expect(countApprovedByLevel(scoped, CONTEST)).toEqual({
      polling_unit: 5,
      ward: 0,
      lga: 1,
      state: 1,
    });
    expect(
      scopeCompletionTotals({
        totals: countHierarchyTargets(LGAS),
        selectedLgaId: "nkanu-west",
        selectedWardId: "nkanu-west-ward-01",
        lgas: LGAS,
      }),
    ).toEqual({ polling_unit: 5, ward: 1, lga: 1, state: 1 });
  });

  it("never lets an approved level exceed its scoped total", () => {
    for (const [lgaId, wardId] of [
      ["all", "all"],
      ["nkanu-west", "all"],
      ["nkanu-west", AKEGBE],
      ["nkanu-west", "nkanu-west-ward-01"],
      ["nkanu-east", "all"],
    ] as const) {
      const scoped = strip(lgaId, wardId);
      for (const level of [
        "polling_unit",
        "ward",
        "lga",
        "state",
      ] as const) {
        expect(scoped.approved[level]).toBeLessThanOrEqual(
          scoped.totals[level],
        );
      }
    }
  });

  it("does not widen a viewer locked to one polling unit", () => {
    const totals = scopeCompletionTotals({
      totals: {
        polling_unit: 1,
        ward: 1,
        lga: 1,
        state: 1,
      },
      selectedLgaId: "nkanu-west",
      selectedWardId: AKEGBE,
      lgas: LGAS,
      pollingUnitLocked: true,
    });

    expect(totals.polling_unit).toBe(1);
    expect(totals.ward).toBe(1);
    expect(totals.lga).toBe(1);
  });
});

describe("level-aware geographic membership", () => {
  const westLga = collation("lga", { lgaId: "nkanu-west" }, []);
  const eastLga = collation("lga", { lgaId: "nkanu-east" }, []);
  const ward01 = collation(
    "ward",
    { wardId: "nkanu-west-ward-01", lgaId: "nkanu-west" },
    [],
  );
  const state = collation("state", {}, []);
  const filter = {
    selectedLgaId: "nkanu-west",
    selectedWardId: AKEGBE,
    lgas: LGAS,
  };

  it("keeps an LGA collation that covers the selected ward", () => {
    expect(isResultInGeographicScope(westLga, filter)).toBe(true);
    expect(isResultInGeographicScope(eastLga, filter)).toBe(false);
  });

  it("always keeps the state collation", () => {
    expect(isResultInGeographicScope(state, filter)).toBe(true);
    expect(
      isResultInGeographicScope(state, {
        selectedLgaId: "nkanu-east",
        selectedWardId: "nkanu-east-ward-04",
        lgas: LGAS,
      }),
    ).toBe(true);
  });

  it("drops a ward collation outside the selected ward", () => {
    expect(isResultInGeographicScope(ward01, filter)).toBe(false);
    expect(
      isResultInGeographicScope(ward01, {
        selectedLgaId: "nkanu-west",
        selectedWardId: "nkanu-west-ward-01",
        lgas: LGAS,
      }),
    ).toBe(true);
  });
});

describe("countDiscrepanciesInScope", () => {
  const fixture = stripFixture();

  it("counts every discrepant collation without a filter", () => {
    const counts = countDiscrepanciesInScope(fixture, fixture, HIERARCHY, {
      selectedLgaId: "all",
      selectedWardId: "all",
      lgas: LGAS,
    });

    /* ward-03 is the only mismatched EC8B; both EC8Cs and EC8D mismatch. */
    expect(counts).toEqual({ ward: 1, lga: 2, state: 1 });
  });

  it("narrows ward and LGA counts to the selected ward", () => {
    const counts = countDiscrepanciesInScope(fixture, fixture, HIERARCHY, {
      selectedLgaId: "nkanu-west",
      selectedWardId: AKEGBE,
      lgas: LGAS,
    });

    expect(counts).toEqual({ ward: 1, lga: 1, state: 1 });
  });

  it("excludes the other LGA's discrepant EC8C and EC8B", () => {
    const counts = countDiscrepanciesInScope(fixture, fixture, HIERARCHY, {
      selectedLgaId: "nkanu-east",
      selectedWardId: "all",
      lgas: LGAS,
    });

    expect(counts).toEqual({ ward: 0, lga: 1, state: 1 });
  });

  it("still aggregates children from the full contest set", () => {
    /* Passing only the filtered slice as children must NOT be how the
     * page calls this — the helper keeps the full set separately. */
    const slice = filterResultsByGeographicScope(fixture, {
      selectedLgaId: "nkanu-west",
      selectedWardId: AKEGBE,
      lgas: LGAS,
    });
    const counts = countDiscrepanciesInScope(
      slice,
      fixture,
      HIERARCHY,
      { selectedLgaId: "nkanu-west", selectedWardId: AKEGBE, lgas: LGAS },
    );

    expect(counts).toEqual({ ward: 1, lga: 1, state: 1 });
  });
});

describe("aggregatePartyVotes", () => {
  it("keeps tracked parties at zero and totals every party", () => {
    const aggregate = aggregatePartyVotes(
      [puResult(AKEGBE, "pu-a"), puResult(AKEGBE, "pu-b")],
      ["APC", "PDP", "ADC"],
    );

    expect(aggregate.totalVotes).toBe(28);
    expect(aggregate.partyTotals).toEqual({ apc: 20, pdp: 8, adc: 0 });
    expect(aggregate.totalVotes).toBe(
      Object.values(aggregate.partyTotals).reduce((sum, v) => sum + v, 0),
    );
  });
});

describe("scopeCompletionTotals with unknown ids", () => {
  it("falls back to zero targets instead of throwing", () => {
    const totals = scopeCompletionTotals({
      totals: countHierarchyTargets(LGAS),
      selectedLgaId: "missing-lga",
      selectedWardId: "all",
      lgas: LGAS,
    });

    expect(totals).toEqual({
      polling_unit: 0,
      ward: 0,
      lga: 0,
      state: 1,
    });
  });
});
