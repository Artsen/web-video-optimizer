import { describe, expect, it } from "vitest";
import {
  analyzeWebFriendliness,
  buildFfmpegArgs,
  defaultSettings,
  formatCaptionTimestamp,
  parseCaptionTimestamp,
  parseNumber,
  parseRate,
  sanitizeFileName,
  shiftCaptionTimings,
  vttToSrt
} from "./video-domain.js";
import type { OptimizationSettings, VideoMetadata } from "./video-domain.js";

function metadata(overrides: Partial<VideoMetadata> = {}): Omit<VideoMetadata, "webFriendly" | "warnings"> {
  return {
    fileName: "source.mov",
    fileSize: 20_000_000,
    durationSeconds: 30,
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    videoCodec: "h264",
    audioCodec: "aac",
    trackCounts: { video: 1, audio: 1, subtitle: 0 },
    pixelFormat: "yuv420p",
    overallBitrate: 4_000_000,
    ...overrides
  };
}

function settings(overrides: Partial<OptimizationSettings> = {}): OptimizationSettings {
  return defaultSettings({
    outputFilename: "output",
    ...overrides
  });
}

describe("video-domain parsing helpers", () => {
  it("parses frame rates and numeric strings", () => {
    expect(parseRate("30000/1001")).toBe(29.97);
    expect(parseRate("24/1")).toBe(24);
    expect(parseRate("0/0")).toBeUndefined();
    expect(parseNumber("128000")).toBe(128000);
    expect(parseNumber("nope")).toBeUndefined();
  });

  it("sanitizes filenames without changing safe characters", () => {
    expect(sanitizeFileName("Product Video final!.mp4")).toBe("Product-Video-final.mp4");
    expect(sanitizeFileName("already_safe-file.webm")).toBe("already_safe-file.webm");
  });
});

describe("video-domain settings and FFmpeg args", () => {
  it("normalizes incompatible output container and codec combinations", () => {
    expect(defaultSettings({ outputContainer: "webm", videoCodec: "libx264" })).toMatchObject({
      outputContainer: "webm",
      videoCodec: "libaom-av1",
      audioCodec: "libopus"
    });
    expect(defaultSettings({ outputContainer: "mp4", videoCodec: "libvpx-vp9", audioCodec: "aac" })).toMatchObject({
      outputContainer: "webm",
      videoCodec: "libvpx-vp9",
      audioCodec: "libopus"
    });
  });

  it("clamps quality and encoder speed settings", () => {
    expect(defaultSettings({ crf: 3, cpuUsed: 99 })).toMatchObject({ crf: 16, cpuUsed: 8 });
    expect(defaultSettings({ crf: 99, cpuUsed: -4 })).toMatchObject({ crf: 40, cpuUsed: 0 });
  });

  it("builds FFmpeg args for resized H.264 MP4 output", () => {
    expect(
      buildFfmpegArgs(
        "input.mp4",
        "output.mp4",
        settings({
          width: 1280,
          frameRate: 24,
          audioMode: "compress",
          audioBitrateKbps: 128,
          audioSampleRate: 48000,
          audioChannels: 2,
          fastStart: true,
          stripMetadata: true
        })
      )
    ).toEqual([
      "-y",
      "-i",
      "input.mp4",
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-crf",
      "24",
      "-preset",
      "medium",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=1280:-2:force_original_aspect_ratio=decrease,fps=24",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-map_metadata",
      "-1",
      "-movflags",
      "+faststart",
      "output.mp4"
    ]);
  });

  it("builds AV1 args with row multithreading and duration limits", () => {
    expect(
      buildFfmpegArgs(
        "input.mp4",
        "output.webm",
        settings({ outputContainer: "webm", videoCodec: "libaom-av1", audioCodec: "libopus", crf: 36, cpuUsed: 5 }),
        5
      )
    ).toContain("-row-mt");
  });
});

describe("video-domain captions", () => {
  it("parses and formats caption timestamps", () => {
    expect(parseCaptionTimestamp("00:01:02.345")).toBe(62.345);
    expect(parseCaptionTimestamp("01:02.345")).toBe(62.345);
    expect(formatCaptionTimestamp(62.345)).toBe("00:01:02.345");
    expect(formatCaptionTimestamp(62.345, ",")).toBe("00:01:02,345");
  });

  it("converts VTT cues to SRT", () => {
    expect(
      vttToSrt(`WEBVTT

00:00:01.000 --> 00:00:02.500 align:start
Hello

00:00:03.000 --> 00:00:04.000
World
`)
    ).toBe(`1
00:00:01,000 --> 00:00:02,500
Hello

2
00:00:03,000 --> 00:00:04,000
World
`);
  });

  it("shifts subtitle timing forward without changing text", () => {
    expect(shiftCaptionTimings("00:00:01.000 --> 00:00:02.000\nHello", 4)).toBe("00:00:05.000 --> 00:00:06.000\nHello");
  });
});

describe("video-domain web compatibility", () => {
  it("marks common MP4/H.264/AAC/yuv420p sources as web friendly", () => {
    expect(analyzeWebFriendliness(metadata())).toEqual({ webFriendly: true, warnings: [] });
  });

  it("warns about unusual containers, codecs, pixel format, and high bitrate", () => {
    const result = analyzeWebFriendliness(
      metadata({
        container: "avi",
        videoCodec: "prores",
        audioCodec: "pcm_s16le",
        pixelFormat: "yuv422p10le",
        overallBitrate: 20_000_000
      })
    );

    expect(result.webFriendly).toBe(false);
    expect(result.warnings).toHaveLength(5);
  });
});
