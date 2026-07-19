import { describe, expect, it } from "vitest";
import { buildSizeComparison, buildTargetOutcome } from "./job-presenters";

describe("compression presentation helpers", () => {
  it("formats measured savings without negative percentages", () => {
    expect(buildSizeComparison(10_000_000, 927_000)).toMatchObject({
      sizeLabel: "905.3 KB",
      changeLabel: "90.7% smaller",
      detailLabel: "8.7 MB saved",
      tone: "good"
    });
  });

  it("formats larger-than-source output as added size", () => {
    expect(buildSizeComparison(9_500_000, 21_900_000)).toMatchObject({
      sizeLabel: "20.9 MB",
      changeLabel: "130.5% larger",
      detailLabel: "11.8 MB added",
      tone: "warn"
    });
  });

  it("distinguishes estimated outcomes", () => {
    expect(buildSizeComparison(9_500_000, 1_200_000, { estimated: true })).toMatchObject({
      sizeLabel: "Estimated 1.1 MB",
      changeLabel: "Likely 87.4% smaller",
      detailLabel: "7.9 MB saved"
    });
  });

  it("formats target met and target missed outcomes", () => {
    expect(buildTargetOutcome(2_000_000, 927_000)).toMatchObject({
      targetLabel: "Target: under 1.9 MB",
      resultLabel: "Result: 905.3 KB",
      statusLabel: "Target met",
      tone: "good"
    });
    expect(buildTargetOutcome(1_000_000, 1_200_000)).toMatchObject({
      statusLabel: "195.3 KB over target",
      tone: "warn"
    });
  });
});
