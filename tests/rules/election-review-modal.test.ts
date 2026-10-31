import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * Round 16B — structural assertions for the discrepancy UI.
 *
 * These read the page sources. Behaviour is covered by
 * election-discrepancy.test.ts; rendering and click-through are a
 * manual browser check.
 */

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const dashboard = read("src/app/portal/election/page.tsx");
const operations = read("src/app/portal/election/operations/page.tsx");
const upload = read("src/app/portal/election/upload/page.tsx");

describe("dashboard discrepancy UI", () => {
  it("computes comparisons and the strip count in memory", () => {
    expect(dashboard).toContain("computeCollationComparison(");
    expect(dashboard).toContain("collationComparisons");
    expect(dashboard).toContain("countDiscrepancies(activeContestResults, hierarchy)");
    expect(dashboard).toContain("visibleDiscrepancyCount");
  });

  it("renders the warning, the filter chip and row badges", () => {
    expect(dashboard).toContain("Discrepancy only");
    expect(dashboard).toContain("Discrepancy");
    expect(dashboard).toContain("Waiting for {comparison.childApprovedCount}");
    expect(dashboard).toContain("Matches");
    expect(dashboard).toContain("bg-amber-50/60");
  });

  it("shows the per-party comparison panel with a pending-coverage state", () => {
    expect(dashboard).toContain("Child aggregation comparison");
    expect(dashboard).toContain("approved child aggregation");
    expect(dashboard).toContain(
      "Waiting for {inspectedComparison.childApprovedCount}",
    );
  });

  it("labels the inspect modal from the ROW's level, not the active tab", () => {
    expect(dashboard).toContain("getResultLevel(inspectResult)");
    expect(dashboard).toContain(
      "Form {inspectedLevelMeta.formCode} Result Evidence",
    );
    expect(dashboard).not.toContain(
      "Form {resultLevelMeta(activeLevel).formCode} Result Evidence",
    );
  });
});

describe("operations desk review panel", () => {
  it("compares the selected collation against its approved children", () => {
    expect(operations).toContain(
      "computeCollationComparison(selectedResult, resultsInScope, electoralData)",
    );
    expect(operations).toContain("Child aggregation comparison");
    expect(operations).toContain(
      "Waiting for {selectedComparison.childApprovedCount}",
    );
  });

  it("asks once before approving a discrepant collation, without blocking", () => {
    expect(operations).toContain("setApproveWarningOpen(true)");
    expect(operations).toContain("skipDiscrepancyConfirm: true");
    expect(operations).toContain("Approve anyway");
    expect(operations).toContain("Approval is not blocked");

    const approveIndex = operations.indexOf(
      'onClick={() => handleReview("approve")}',
    );
    expect(approveIndex).toBeGreaterThan(-1);

    const approveButton = operations.slice(approveIndex, approveIndex + 600);
    expect(approveButton).toContain(
      "disabled={submittingAction || electionModeLoading || !electionMode}",
    );
    expect(approveButton).not.toContain("hasDiscrepancy");
  });
});

describe("upload pre-submit aggregation hint", () => {
  it("reuses the duplicate-check rows instead of issuing another query", () => {
    expect(upload).toContain("computeChildAggregationPreview");
    expect(upload).toContain("setScopeRows(rows as ExistingResult[])");
    expect(upload).toContain("scopeRows.filter(");
    expect(upload).toContain("const [scopeRows, setScopeRows]");
  });

  it("renders only for collation levels and explains pending coverage", () => {
    expect(upload).toContain('{level !== "polling_unit" && childPreview && (');
    expect(upload).toContain("Based on approved child results:");
    expect(upload).toContain("Coverage: {childPreview.childApprovedCount}/");
  });

  it("shows an amber hint when entered totals differ from the aggregate", () => {
    expect(upload).toContain("enteredDiffersFromAggregation");
    expect(upload).toContain(
      "Your totals differ from the aggregation. Officer will review",
    );
  });
});
