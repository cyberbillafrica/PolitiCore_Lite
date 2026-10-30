import { describe, expect, it } from "vitest";

import {
  availableUploadLevels,
  countApprovedByLevel,
  countHierarchyTargets,
  getResultLevel,
  visibleResultLevels,
} from "@/lib/election-levels";
import type {
  ElectionContest,
  LGA,
  OrganizationalAssignment,
} from "@/types";

/*
 * Round 16A — dashboard tabs and completion strip.
 *
 * These are pure derivations from the active contest and the loaded
 * in-memory results, so they do not need the emulator: the tabs are
 * decided by contest scope, the strip counts come from the hierarchy
 * plus the ONE merged result list.
 */

function contest(scope_type: string): ElectionContest {
  return {
    id: `contest-${scope_type}`,
    name: `${scope_type} contest`,
    scope_type,
  } as unknown as ElectionContest;
}

const LGAS: LGA[] = [
  {
    id: "nkanu-west",
    code: "NW",
    name: "Nkanu West",
    wards: [
      {
        id: "nkanu-west-ward-01",
        code: "W01",
        name: "Ward 01",
        pollingUnits: [
          { id: "nkanu-west-ward-01-pu-001", code: "001", name: "PU 001" },
          { id: "nkanu-west-ward-01-pu-002", code: "002", name: "PU 002" },
        ],
      },
      {
        id: "nkanu-west-ward-02",
        code: "W02",
        name: "Ward 02",
        pollingUnits: [
          { id: "nkanu-west-ward-02-pu-001", code: "001", name: "PU 001" },
        ],
      },
    ],
  },
  {
    id: "nsukka",
    code: "NS",
    name: "Nsukka",
    wards: [
      {
        id: "nsukka-ward-01",
        code: "W01",
        name: "Ward 01",
        pollingUnits: [
          { id: "nsukka-ward-01-pu-001", code: "001", name: "PU 001" },
        ],
      },
    ],
  },
];

describe("dashboard tabs by contest scope", () => {
  it("shows all four tabs for a state-wide contest", () => {
    expect(visibleResultLevels(contest("state"), ["nkanu-west"])).toEqual([
      "polling_unit",
      "ward",
      "lga",
      "state",
    ]);
  });

  it("shows PU and Ward only for an LGA contest", () => {
    expect(visibleResultLevels(contest("lga"), ["nkanu-west"])).toEqual([
      "polling_unit",
      "ward",
    ]);
  });

  it("shows PU, Ward and LGA for a federal constituency contest", () => {
    expect(
      visibleResultLevels(contest("federal_constituency"), [
        "nkanu-west",
        "nsukka",
      ]),
    ).toEqual(["polling_unit", "ward", "lga"]);
  });

  it("hides the LGA tab for a single-LGA constituency", () => {
    expect(
      visibleResultLevels(contest("state_constituency"), ["nkanu-west"]),
    ).toEqual(["polling_unit", "ward"]);
  });

  it("shows no tabs without an active contest", () => {
    expect(visibleResultLevels(null, [])).toEqual([]);
  });
});

describe("completion strip counts", () => {
  it("counts the hierarchy targets per level", () => {
    expect(countHierarchyTargets(LGAS)).toEqual({
      polling_unit: 4,
      ward: 3,
      lga: 2,
      state: 1,
    });
  });

  it("counts approved results per level and treats legacy rows as PU", () => {
    const counts = countApprovedByLevel(
      [
        /* legacy PU doc — no result_level */
        { contest_id: "c1", status: "approved" },
        { contest_id: "c1", status: "submitted", result_level: "ward" },
        { contest_id: "c1", status: "approved", result_level: "ward" },
        { contest_id: "c1", status: "approved", result_level: "lga" },
        { contest_id: "c1", status: "approved", result_level: "state" },
        /* another contest must not leak into the strip */
        { contest_id: "c2", status: "approved", result_level: "lga" },
        { contest_id: "c2", status: "approved" },
      ],
      "c1",
    );

    expect(counts).toEqual({
      polling_unit: 1,
      ward: 1,
      lga: 1,
      state: 1,
    });
  });

  it("defaults a missing result_level to polling_unit", () => {
    expect(getResultLevel({})).toBe("polling_unit");
    expect(getResultLevel({ result_level: null })).toBe("polling_unit");
    expect(getResultLevel({ result_level: "ward" })).toBe("ward");
    expect(getResultLevel({ result_level: "nonsense" })).toBe("polling_unit");
  });
});

describe("upload level selector", () => {
  const assignment = (
    position: OrganizationalAssignment["position"],
    scope_type: OrganizationalAssignment["scope_type"],
  ): Pick<OrganizationalAssignment, "position" | "scope_type" | "status"> => ({
    position,
    scope_type,
    status: "active",
  });

  it("offers only polling unit to a plain member", () => {
    expect(
      availableUploadLevels({
        isAdminOrElectionOfficer: false,
        assignments: [],
        contest: contest("state"),
      }),
    ).toEqual(["polling_unit"]);
  });

  it("offers ward, LGA and state to a state coordinator on a state contest", () => {
    expect(
      availableUploadLevels({
        isAdminOrElectionOfficer: false,
        assignments: [assignment("state_coordinator", "state")],
        contest: contest("state"),
      }),
    ).toEqual(["polling_unit", "ward", "lga", "state"]);
  });

  it("never offers state-level EC8D on a non-state contest", () => {
    expect(
      availableUploadLevels({
        isAdminOrElectionOfficer: false,
        assignments: [assignment("state_coordinator", "state")],
        contest: contest("federal_constituency"),
      }),
    ).toEqual(["polling_unit", "ward", "lga"]);
  });

  it("offers ward and LGA to an LGA coordinator", () => {
    expect(
      availableUploadLevels({
        isAdminOrElectionOfficer: false,
        assignments: [assignment("lga_coordinator", "lga")],
        contest: contest("federal_constituency"),
      }),
    ).toEqual(["polling_unit", "ward", "lga"]);
  });

  it("offers all four levels to an officer on a state contest", () => {
    expect(
      availableUploadLevels({
        isAdminOrElectionOfficer: true,
        assignments: [],
        contest: contest("state"),
      }),
    ).toEqual(["polling_unit", "ward", "lga", "state"]);
  });
});
