import { describe, expect, it } from "vitest";
import {
  buildRecommendations,
  estimateOutputSize,
  normalizeOutputContainerChange,
  normalizeVideoCodecChange
} from "./video-ui";
import type { Settings, VideoMetadata } from "./video-ui";

function metadata(overrides: Partial<VideoMetadata> = {}): VideoMetadata {
  return {
    fileName: "source.mp4",
    fileSize: 20_000_000,
    durationSeconds: 40,
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    videoCodec: "h264",
    audioCodec: "aac",
    trackCounts: { video: 1, audio: 1, subtitle: 0 },
    width: 1920,
    height: 1080,
    frameRate: 60,
    overallBitrate: 10_000_000,
    audioBitrate: 160_000,
    pixelFormat: "yuv420p",
    webFriendly: true,
    warnings: [],
    ...overrides
  };
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    outputContainer: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    crf: 26,
    preset: "slow",
    cpuUsed: 5,
    rowMt: true,
    audioMode: "compress",
    audioBitrateKbps: 128,
    fastStart: true,
    stripMetadata: true,
    outputFilename: "optimized",
    ...overrides
  };
}

describe("estimateOutputSize", () => {
  it("returns no byte estimate when duration is unknown", () => {
    expect(estimateOutputSize(metadata({ durationSeconds: 0 }), settings())).toEqual({
      note: "Estimate unavailable until duration is known."
    });
  });

  it("accounts for CRF, resize, frame rate, and audio removal", () => {
    const estimate = estimateOutputSize(
      metadata(),
      settings({
        width: 1280,
        frameRate: 24,
        audioMode: "remove"
      })
    );

    expect(estimate.bytes).toBeGreaterThan(0);
    expect(estimate.bytes).toBeLessThan(20_000_000);
    expect(estimate.reduction).toBeGreaterThan(0);
  });
});

describe("recommendations", () => {
  it("warns about incompatible container and codec choices", () => {
    const recommendations = buildRecommendations(
      metadata(),
      settings({ outputContainer: "webm", videoCodec: "libx264" })
    );

    expect(
      recommendations.some((item) => item.tone === "warn" && item.text.includes("WebM should use AV1 or VP9"))
    ).toBe(true);
  });

  it("returns a default positive recommendation for ordinary settings", () => {
    expect(
      buildRecommendations(metadata({ overallBitrate: 4_000_000, frameRate: 24 }), settings({ width: 1280 }))
    ).toContainEqual({
      tone: "good",
      text: "Fast-start is enabled, which helps MP4 playback begin sooner on web pages."
    });
  });
});

describe("codec and container normalization", () => {
  it("moves H.264 away from WebM and uses Opus audio", () => {
    expect(
      normalizeOutputContainerChange(settings({ videoCodec: "libx264", audioCodec: "aac" }), "webm")
    ).toMatchObject({
      outputContainer: "webm",
      videoCodec: "libaom-av1",
      audioCodec: "libopus",
      fastStart: false
    });
  });

  it("moves VP9 into WebM with Opus audio", () => {
    expect(
      normalizeVideoCodecChange(settings({ outputContainer: "mp4", audioCodec: "aac" }), "libvpx-vp9")
    ).toMatchObject({
      outputContainer: "webm",
      videoCodec: "libvpx-vp9",
      audioCodec: "libopus"
    });
  });
});
