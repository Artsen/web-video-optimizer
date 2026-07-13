import { describe, expect, it } from "vitest";
import { normalizeOptimizationSettings } from "../src/index.js";

describe("normalizeOptimizationSettings", () => {
  it("uses MP4/H.264/AAC defaults for empty input", () => {
    expect(normalizeOptimizationSettings({})).toMatchObject({
      outputContainer: "mp4",
      videoCodec: "libx264",
      audioCodec: "aac",
      crf: 24,
      preset: "medium",
      cpuUsed: 5,
      rowMt: true,
      audioMode: "compress",
      audioBitrateKbps: 128,
      fastStart: true,
      stripMetadata: true
    });
  });

  it("uses WebM/AV1/Opus defaults for WebM input", () => {
    expect(normalizeOptimizationSettings({ outputContainer: "webm" })).toMatchObject({
      outputContainer: "webm",
      videoCodec: "libaom-av1",
      audioCodec: "libopus"
    });
  });

  it("corrects H.264 away from WebM", () => {
    expect(normalizeOptimizationSettings({ outputContainer: "webm", videoCodec: "libx264" })).toMatchObject({
      outputContainer: "webm",
      videoCodec: "libaom-av1",
      audioCodec: "libopus"
    });
  });

  it("forces VP9 into WebM", () => {
    expect(normalizeOptimizationSettings({ outputContainer: "mp4", videoCodec: "libvpx-vp9" })).toMatchObject({
      outputContainer: "webm",
      videoCodec: "libvpx-vp9",
      audioCodec: "libopus"
    });
  });

  it("corrects AAC for WebM and Opus for MP4", () => {
    expect(normalizeOptimizationSettings({ outputContainer: "webm", audioCodec: "aac" })).toMatchObject({
      audioCodec: "libopus"
    });
    expect(normalizeOptimizationSettings({ outputContainer: "mp4", audioCodec: "libopus" })).toMatchObject({
      audioCodec: "aac"
    });
  });

  it("clamps CRF and CPU-used values", () => {
    expect(normalizeOptimizationSettings({ crf: 3, cpuUsed: 99 })).toMatchObject({ crf: 16, cpuUsed: 8 });
    expect(normalizeOptimizationSettings({ crf: 99, cpuUsed: -4 })).toMatchObject({ crf: 40, cpuUsed: 0 });
  });

  it("preserves explicit optional settings and output filename", () => {
    expect(
      normalizeOptimizationSettings({
        width: 1280,
        height: 720,
        frameRate: 24,
        audioSampleRate: 48000,
        audioChannels: 2,
        rowMt: false,
        fastStart: false,
        stripMetadata: false,
        outputFilename: "custom-name"
      })
    ).toMatchObject({
      width: 1280,
      height: 720,
      frameRate: 24,
      audioSampleRate: 48000,
      audioChannels: 2,
      rowMt: false,
      fastStart: false,
      stripMetadata: false,
      outputFilename: "custom-name"
    });
  });
});
