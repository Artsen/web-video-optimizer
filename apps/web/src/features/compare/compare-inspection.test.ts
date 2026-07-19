import { describe, expect, it } from "vitest";
import {
  adjustWipePosition,
  clampWipePosition,
  linkedViewTransform,
  nextFrameTime,
  shouldShowOriginalForAb
} from "./compare-inspection";

describe("compare inspection helpers", () => {
  it("clamps and keyboard-adjusts wipe divider positions", () => {
    expect(clampWipePosition(Number.NaN)).toBe(50);
    expect(clampWipePosition(-10)).toBe(0);
    expect(clampWipePosition(120)).toBe(100);
    expect(adjustWipePosition(50, 7)).toBe(57);
    expect(adjustWipePosition(98, 7)).toBe(100);
  });

  it("steps approximate frames without going below zero", () => {
    expect(nextFrameTime(1, 1, 25)).toBeCloseTo(1.04);
    expect(nextFrameTime(0.01, -1, 24)).toBe(0);
  });

  it("keeps linked zoom and pan expressed as one shared transform", () => {
    expect(linkedViewTransform({ zoom: 2, panX: 12, panY: -4 })).toBe("translate3d(12px, -4px, 0) scale(2)");
  });

  it("only shows original in A/B mode when toggled or held", () => {
    expect(shouldShowOriginalForAb({ mode: "grid", holdOriginal: true, toggledOriginal: false })).toBe(false);
    expect(shouldShowOriginalForAb({ mode: "ab", holdOriginal: true, toggledOriginal: false })).toBe(true);
    expect(shouldShowOriginalForAb({ mode: "ab", holdOriginal: false, toggledOriginal: true })).toBe(true);
    expect(shouldShowOriginalForAb({ mode: "ab", holdOriginal: false, toggledOriginal: false })).toBe(false);
  });
});
