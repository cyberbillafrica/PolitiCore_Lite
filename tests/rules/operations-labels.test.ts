import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * Round 16B — operations desk labels.
 *
 * A collation has no polling unit (and EC8C/EC8D have no ward), so the
 * old PU-only label rendered a blank heading. Both the list row and the
 * inspection panel now derive their label from the document's own level.
 */

const root = process.cwd();
const operations = readFileSync(
  join(root, "src/app/portal/election/operations/page.tsx"),
  "utf8",
);

describe("operations desk level-aware labels", () => {
  it("reads each row's own result_level", () => {
    expect(operations).toContain("getResultLevel(result)");
    expect(operations).toContain("resultLevelMeta(getResultLevel(res)).formCode");
  });

  it("has a label per level", () => {
    expect(operations).toContain("Ward: ${wardDisplayLabel");
    expect(operations).toContain("LGA: ${lgaDisplayLabel");
    expect(operations).toContain("State: ${result.state_id");
    expect(operations).toContain("pollingUnitDisplayLabel(");
  });

  it("uses the label in the queue rows and the inspection panel", () => {
    expect(operations).toContain("{levelLabel(res)}");
    expect(operations).toContain("{levelLabel(selectedResult)}");
    expect(operations).toContain("{levelDetail(res)}");
    expect(operations).toContain("{levelDetail(selectedResult)}");
  });

  it("no longer renders the raw PU label for every level", () => {
    expect(operations).not.toContain("{labels.pu}");
    expect(operations).not.toContain("Ward {labels.ward}");
  });
});
