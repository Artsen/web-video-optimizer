import { describe, expect, it } from "vitest";
import { estimateOutputSize, normalizeOptimizationSettings } from "../src/index.js";
import type { VideoMetadata } from "@local-video-optimizer/contracts";

function metadata(overrides: Partial<VideoMetadata> = {}): VideoMetadata {
  return {
    fileName: "source.mp4",
    fileSize: 20_000_000,
    durationSeconds: 40,
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    trackCounts: { video: 1, audio: 1, subtitle: 0 },
    width: 1920,
    height: 1080,
    frameRate: 60,
    overallBitrate: 10_000_000,
    audioBitrate: 160_000,
    webFriendly: true,
    warnings: [],
    ...overrides
  };
}

describe("estimateOutputSize", () => {
  it("requires duration", () => {
    expect(estimateOutputSize(metadata({ durationSeconds: 0 }), normalizeOptimizationSettings({}))).toEqual({
      note: "Estimate unavailable until duration is known."
    });
  });

  it("estimates no-audio and compressed-audio outputs", () => {
    const silent = estimateOutputSize(
      metadata({ trackCounts: { video: 1, audio: 0, subtitle: 0 } }),
      normalizeOptimizationSettings({ audioMode: "remove" })
    );
    const audio = estimateOutputSize(metadata(), normalizeOptimizationSettings({ audioBitrateKbps: 96 }));
    expect(silent.bytes).toBeLessThan(audio.bytes ?? Number.POSITIVE_INFINITY);
  });

  it("accounts for scaling and frame-rate reduction", () => {
    const full = estimateOutputSize(metadata(), normalizeOptimizationSettings({ crf: 24 }));
    const reduced = estimateOutputSize(
      metadata(),
      normalizeOptimizationSettings({ width: 960, frameRate: 30, crf: 24 })
    );
    expect(reduced.bytes).toBeLessThan(full.bytes ?? 0);
  });

  it("uses the minimum video bitrate floor when source bitrate is missing", () => {
    const result = estimateOutputSize(metadata({ overallBitrate: undefined }), normalizeOptimizationSettings({}));
    expect(result.bytes).toBe(1_540_000);
  });

  it("calculates reduction for known source size and respects CRF boundaries used by the function", () => {
    const lowCrf = estimateOutputSize(metadata(), normalizeOptimizationSettings({ crf: 16 }));
    const highCrf = estimateOutputSize(metadata(), normalizeOptimizationSettings({ crf: 40 }));
    expect(lowCrf.reduction).toBeDefined();
    expect(highCrf.bytes).toBeLessThan(lowCrf.bytes ?? 0);
  });
});
