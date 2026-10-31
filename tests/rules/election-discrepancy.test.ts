import { describe, expect, it } from "vitest";

import {
  computeChildAggregationPreview,
  computeCollationComparison,
  countDiscrepancies,
  getResultLevel,
  type ComparisonResultInput,
} from "@/lib/election-levels";
import type { EnuguStateElectoralData } from "@/types";

/*
 * Round 16B — collation discrepancy detection.
 *
 * Pure derivations over the in-memory result list and the electoral
 * hierarchy. No emulator: nothing here reads Firestore.
 *
 * Hierarchy used below:
 *
 *   nkanu-west
 *     ward-01  -> pu-01, pu-02
 *     ward-02  -> pu-03
 *   nkanu-east
 *     ward-03  -> pu-04
 */

const HIERARCHY: EnuguStateElectoralData = {
  state: "Enugu State",
  lgas: [
    {
      id: "nkanu-west",
      code: "NW",
      name: "Nkanu West",
      wards: [
        {
          id: "nkanu-west-ward-01",
          code: "NW01",
          name: "Agbani",
          pollingUnits: [
            { id: "pu-01", code: "001", name: "Central School" },
            { id: "pu-02", code: "002", name: "Town Hall" },
          ],
        },
        {
          id: "nkanu-west-ward-02",
          code: "NW02",
          name: "Owo",
          pollingUnits: [{ id: "pu-03", code: "003", name: "Owo Square" }],
        },
      ],
    },
    {
      id: "nkanu-east",
      code: "NE",
      name: "Nkanu East",
      wards: [
        {
          id: "nkanu-east-ward-03",
          code: "NE01",
          name: "Amagunze",
          pollingUnits: [{ id: "pu-04", code: "004", name: "Amagunze Hall" }],
        },
      ],
    },
  ],
};

const CONTEST = "contest-1";
const STATE = "enugu-state";

function votes(
  ...entries: Array<[string, number]>
): Array<{ party: string; votes: number }> {
  return entries.map(([party, count]) => ({ party, votes: count }));
}

function wardCollation(
  wardId: string,
  results: Array<{ party: string; votes: number }>,
  overrides: Partial<ComparisonResultInput> = {},
): ComparisonResultInput {
  return {
    contest_id: CONTEST,
    result_level: "ward",
    status: "approved",
    ward_id: wardId,
    lga_id: wardId.startsWith("nkanu-west") ? "nkanu-west" : "nkanu-east",
    state_id: STATE,
    results,
    ...overrides,
  };
}

function lgaCollation(
  lgaId: string,
  results: Array<{ party: string; votes: number }>,
  overrides: Partial<ComparisonResultInput> = {},
): ComparisonResultInput {
  return {
    contest_id: CONTEST,
    result_level: "lga",
    status: "approved",
    ward_id: "",
    lga_id: lgaId,
    state_id: STATE,
    results,
    ...overrides,
  };
}

function stateCollation(
  results: Array<{ party: string; votes: number }>,
  overrides: Partial<ComparisonResultInput> = {},
): ComparisonResultInput {
  return {
    contest_id: CONTEST,
    result_level: "state",
    status: "approved",
    ward_id: "",
    lga_id: "",
    state_id: STATE,
    results,
    ...overrides,
  };
}

function puResult(
  wardId: string,
  pollingUnitId: string,
  results: Array<{ party: string; votes: number }>,
  overrides: Partial<ComparisonResultInput> = {},
): ComparisonResultInput {
  return {
    contest_id: CONTEST,
    result_level: "polling_unit",
    status: "approved",
    ward_id: wardId,
    lga_id: wardId.startsWith("nkanu-west") ? "nkanu-west" : "nkanu-east",
    state_id: STATE,
    results,
    ...overrides,
  };
}

describe("computeCollationComparison — ward (EC8B)", () => {
  const ward = "nkanu-west-ward-01";
  const collation = wardCollation(ward, votes(["APC", 100], ["PDP", 50]));
  const children = [
    puResult(ward, "pu-01", votes(["APC", 60], ["PDP", 20])),
    puResult(ward, "pu-02", votes(["APC", 40], ["PDP", 30])),
  ];

  it("matches when every child is approved and the totals agree", () => {
    const comparison = computeCollationComparison(
      collation,
      [collation, ...children],
      HIERARCHY,
    );

    expect(comparison).not.toBeNull();
    expect(comparison!.isComplete).toBe(true);
    expect(comparison!.childCount).toBe(2);
    expect(comparison!.childApprovedCount).toBe(2);
    expect(comparison!.hasDiscrepancy).toBe(false);
    expect(comparison!.submittedTotal).toBe(150);
    expect(comparison!.aggregatedTotal).toBe(150);
  });

  it("is incomplete, not discrepant, while coverage is pending", () => {
    const comparison = computeCollationComparison(
      collation,
      [collation, children[0]],
      HIERARCHY,
    );

    expect(comparison!.isComplete).toBe(false);
    expect(comparison!.childApprovedCount).toBe(1);
    expect(comparison!.hasDiscrepancy).toBe(false);
  });

  it("flags a mismatch once every child is approved", () => {
    const mismatched = wardCollation(
      ward,
      votes(["APC", 95], ["PDP", 50]),
    );

    const comparison = computeCollationComparison(
      mismatched,
      [mismatched, ...children],
      HIERARCHY,
    );

    expect(comparison!.isComplete).toBe(true);
    expect(comparison!.hasDiscrepancy).toBe(true);

    const apc = comparison!.perParty.find((entry) => entry.party === "APC");
    expect(apc).toMatchObject({
      submitted: 95,
      aggregated: 100,
      difference: -5,
      isDiscrepant: true,
    });

    const pdp = comparison!.perParty.find((entry) => entry.party === "PDP");
    expect(pdp?.isDiscrepant).toBe(false);
  });

  it("does not flag a partial mismatch while coverage is pending", () => {
    const mismatched = wardCollation(ward, votes(["APC", 95]));

    const comparison = computeCollationComparison(
      mismatched,
      [mismatched, children[0]],
      HIERARCHY,
    );

    expect(comparison!.isComplete).toBe(false);
    expect(comparison!.hasDiscrepancy).toBe(false);
  });

  it("computes positive differences with a sign-safe number", () => {
    const high = wardCollation(ward, votes(["NDC", 803]));
    const comparison = computeCollationComparison(
      high,
      [high, puResult(ward, "pu-01", votes(["NDC", 800])), children[1]],
      HIERARCHY,
    );

    const ndc = comparison!.perParty.find((entry) => entry.party === "NDC");
    expect(ndc?.difference).toBe(3);
  });

  it("computes negative differences", () => {
    const low = wardCollation(ward, votes(["NDC", 797]));
    const comparison = computeCollationComparison(
      low,
      [low, puResult(ward, "pu-01", votes(["NDC", 800])), children[1]],
      HIERARCHY,
    );

    const ndc = comparison!.perParty.find((entry) => entry.party === "NDC");
    expect(ndc?.difference).toBe(-3);
  });

  it("treats a zero-vote collation and zero-vote children as a match", () => {
    const emptyCollation = wardCollation(ward, votes(["APC", 0]));
    const comparison = computeCollationComparison(
      emptyCollation,
      [
        emptyCollation,
        puResult(ward, "pu-01", votes(["APC", 0])),
        puResult(ward, "pu-02", votes(["APC", 0])),
      ],
      HIERARCHY,
    );

    expect(comparison!.isComplete).toBe(true);
    expect(comparison!.hasDiscrepancy).toBe(false);
    expect(comparison!.submittedTotal).toBe(0);
    expect(comparison!.aggregatedTotal).toBe(0);
  });

  it("counts legacy PU documents (no result_level) as children", () => {
    const legacy = puResult(ward, "pu-01", votes(["APC", 60], ["PDP", 20]));
    delete (legacy as { result_level?: string }).result_level;

    expect(getResultLevel(legacy)).toBe("polling_unit");

    const comparison = computeCollationComparison(
      collation,
      [
        collation,
        legacy,
        puResult(ward, "pu-02", votes(["APC", 40], ["PDP", 30])),
      ],
      HIERARCHY,
    );

    expect(comparison!.childApprovedCount).toBe(2);
    expect(comparison!.isComplete).toBe(true);
    expect(comparison!.hasDiscrepancy).toBe(false);
  });

  it("never treats a legacy document as a collation", () => {
    const legacy = puResult(ward, "pu-01", votes(["APC", 60]));
    delete (legacy as { result_level?: string }).result_level;

    expect(computeCollationComparison(legacy, [legacy], HIERARCHY)).toBeNull();
  });

  it("requires the child to belong to the same contest", () => {
    const comparison = computeCollationComparison(
      wardCollation(ward, votes(["APC", 100])),
      [
        puResult(
          ward,
          "pu-01",
          votes(["APC", 100]),
          { contest_id: "contest-2" },
        ),
      ],
      HIERARCHY,
    );

    expect(comparison!.childApprovedCount).toBe(0);
    expect(comparison!.aggregatedTotal).toBe(0);
    expect(comparison!.isComplete).toBe(false);
    expect(comparison!.hasDiscrepancy).toBe(false);
  });

  it("never throws for a ward missing from the hierarchy", () => {
    const unknown = wardCollation("missing-ward", votes(["APC", 10]));
    const comparison = computeCollationComparison(
      unknown,
      [unknown],
      HIERARCHY,
    );

    expect(comparison!.childCount).toBe(0);
    expect(comparison!.isComplete).toBe(false);
    expect(comparison!.hasDiscrepancy).toBe(false);
  });
});

describe("computeCollationComparison — LGA and state", () => {
  it("compares an LGA collation with ward collations, not PU results", () => {
    const lga = lgaCollation("nkanu-west", votes(["APC", 200]));
    const ward01 = wardCollation(
      "nkanu-west-ward-01",
      votes(["APC", 120]),
    );
    const ward02 = wardCollation(
      "nkanu-west-ward-02",
      votes(["APC", 80]),
    );
    const hugePuResults = [
      puResult("nkanu-west-ward-01", "pu-01", votes(["APC", 9999])),
    ];

    const comparison = computeCollationComparison(
      lga,
      [lga, ward01, ward02, ...hugePuResults],
      HIERARCHY,
    );

    expect(comparison!.resultLevel).toBe("lga");
    expect(comparison!.childCount).toBe(2);
    expect(comparison!.childApprovedCount).toBe(2);
    expect(comparison!.aggregatedTotal).toBe(200);
    expect(comparison!.hasDiscrepancy).toBe(false);
  });

  it("compares a state collation with LGA collations", () => {
    const state = stateCollation(votes(["APC", 300]));
    const west = lgaCollation("nkanu-west", votes(["APC", 200]));
    const east = lgaCollation("nkanu-east", votes(["APC", 100]));
    const wardNoise = wardCollation(
      "nkanu-west-ward-01",
      votes(["APC", 999]),
    );

    const comparison = computeCollationComparison(
      state,
      [state, west, east, wardNoise],
      HIERARCHY,
    );

    expect(comparison!.resultLevel).toBe("state");
    expect(comparison!.childCount).toBe(HIERARCHY.lgas.length);
    expect(comparison!.childApprovedCount).toBe(2);
    expect(comparison!.aggregatedTotal).toBe(300);
    expect(comparison!.hasDiscrepancy).toBe(false);
  });

  it("flags a state mismatch only when every LGA collation is approved", () => {
    const state = stateCollation(votes(["APC", 320]));
    const west = lgaCollation("nkanu-west", votes(["APC", 200]));
    const east = lgaCollation("nkanu-east", votes(["APC", 100]));

    const complete = computeCollationComparison(
      state,
      [state, west, east],
      HIERARCHY,
    );
    expect(complete!.isComplete).toBe(true);
    expect(complete!.hasDiscrepancy).toBe(true);

    const partial = computeCollationComparison(state, [state, west], HIERARCHY);
    expect(partial!.isComplete).toBe(false);
    expect(partial!.hasDiscrepancy).toBe(false);
  });
});

describe("countDiscrepancies", () => {
  it("counts discrepant collations per level", () => {
    const ward01 = wardCollation(
      "nkanu-west-ward-01",
      votes(["APC", 95]),
      { status: "submitted" },
    );
    const ward02 = wardCollation("nkanu-west-ward-02", votes(["APC", 50]));
    const west = lgaCollation("nkanu-west", votes(["APC", 145]));
    const east = lgaCollation("nkanu-east", votes(["APC", 55]));
    const state = stateCollation(votes(["APC", 999]));

    const results: ComparisonResultInput[] = [
      ward01,
      ward02,
      west,
      east,
      state,
      // Children below are PU results deriving the ward total.
      puResult("nkanu-west-ward-01", "pu-01", votes(["APC", 60])),
      puResult("nkanu-west-ward-01", "pu-02", votes(["APC", 40])),
      puResult("nkanu-west-ward-02", "pu-03", votes(["APC", 50])),
      puResult("nkanu-east-ward-03", "pu-04", votes(["APC", 55])),
    ];

    expect(countDiscrepancies(results, HIERARCHY)).toEqual({
      ward: 1,
      lga: 0,
      state: 1,
    });
  });

  it("ignores rejected and clarification collations", () => {
    const ward = wardCollation(
      "nkanu-west-ward-01",
      votes(["APC", 999]),
      { status: "rejected" },
    );

    expect(
      countDiscrepancies(
        [
          ward,
          puResult("nkanu-west-ward-01", "pu-01", votes(["APC", 1])),
          puResult("nkanu-west-ward-01", "pu-02", votes(["APC", 1])),
        ],
        HIERARCHY,
      ),
    ).toEqual({ ward: 0, lga: 0, state: 0 });
  });
});

describe("computeChildAggregationPreview", () => {
  it("aggregates approved children without a collation document", () => {
    const preview = computeChildAggregationPreview(
      "ward",
      "nkanu-west-ward-01",
      [
        puResult("nkanu-west-ward-01", "pu-01", votes(["APC", 60], ["PDP", 20])),
        puResult("nkanu-west-ward-01", "pu-02", votes(["APC", 40], ["PDP", 30])),
      ],
      HIERARCHY,
    );

    expect(preview.childCount).toBe(2);
    expect(preview.childApprovedCount).toBe(2);
    expect(preview.perParty).toEqual({ APC: 100, PDP: 50 });
  });

  it("uses the hierarchy totals for an LGA preview", () => {
    const preview = computeChildAggregationPreview(
      "lga",
      "nkanu-west",
      [wardCollation("nkanu-west-ward-01", votes(["APC", 100]))],
      HIERARCHY,
    );

    expect(preview.childCount).toBe(2);
    expect(preview.childApprovedCount).toBe(1);
    expect(preview.perParty.APC).toBe(100);
  });
});
