import { describe, expect, it } from "vitest";
import {
  OptimizationSettingsInputSchema,
  OptimizationSettingsSchema,
  type OptimizationSettings
} from "../src/index.js";

const baseSettings: OptimizationSettings = {
  outputContainer: "mp4",
  videoCodec: "libx264",
  audioCodec: "aac",
  crf: 26,
  preset: "slow",
  cpuUsed: 5,
  rowMt: true,
  frameRate: 24,
  audioMode: "compress",
  audioBitrateKbps: 128,
  audioSampleRate: 48000,
  audioChannels: 2,
  fastStart: true,
  stripMetadata: true,
  outputFilename: "homepage-video"
};

describe("OptimizationSettingsSchema", () => {
  it("accepts valid MP4 H.264 AAC settings", () => {
    expect(OptimizationSettingsSchema.safeParse(baseSettings).success).toBe(true);
  });

  it("accepts valid WebM VP9 Opus settings", () => {
    expect(
      OptimizationSettingsSchema.safeParse({
        ...baseSettings,
        outputContainer: "webm",
        videoCodec: "libvpx-vp9",
        audioCodec: "libopus",
        fastStart: false
      }).success
    ).toBe(true);
  });

  it("accepts valid WebM AV1 Opus settings", () => {
    expect(
      OptimizationSettingsSchema.safeParse({
        ...baseSettings,
        outputContainer: "webm",
        videoCodec: "libaom-av1",
        audioCodec: "libopus",
        crf: 36,
        fastStart: false
      }).success
    ).toBe(true);
  });

  it("rejects an invalid container enum", () => {
    expect(OptimizationSettingsSchema.safeParse({ ...baseSettings, outputContainer: "mov" }).success).toBe(false);
  });

  it("rejects an invalid codec enum", () => {
    expect(OptimizationSettingsSchema.safeParse({ ...baseSettings, videoCodec: "hevc" }).success).toBe(false);
  });

  it("allows optional width and height to be omitted or provided", () => {
    expect(OptimizationSettingsSchema.safeParse(baseSettings).success).toBe(true);
    expect(OptimizationSettingsSchema.safeParse({ ...baseSettings, width: 1280, height: 720 }).success).toBe(true);
  });

  it("separates partial input from fully normalized settings", () => {
    expect(OptimizationSettingsInputSchema.safeParse({ crf: 40, outputContainer: "webm" }).success).toBe(true);
    expect(OptimizationSettingsSchema.safeParse({ crf: 40, outputContainer: "webm" }).success).toBe(false);
  });
});
