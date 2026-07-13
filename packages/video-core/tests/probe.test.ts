import { describe, expect, it } from "vitest";
import { normalizeProbe, parseNumber, parseRate } from "../src/index.js";
import type { FFprobeResult } from "../src/index.js";

function probe(overrides: Partial<FFprobeResult> = {}): FFprobeResult {
  return {
    format: {
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
      format_long_name: "QuickTime / MOV",
      duration: "30.5",
      size: "20000000",
      bit_rate: "4000000",
      tags: { major_brand: "isom" }
    },
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        width: 1920,
        height: 1080,
        display_aspect_ratio: "16:9",
        avg_frame_rate: "30000/1001",
        bit_rate: "3800000",
        pix_fmt: "yuv420p",
        color_space: "bt709",
        color_transfer: "bt709",
        color_primaries: "bt709",
        tags: { rotate: "90" }
      },
      {
        codec_type: "audio",
        codec_name: "aac",
        bit_rate: "128000",
        sample_rate: "48000",
        channels: 2
      }
    ],
    ...overrides
  };
}

describe("probe parsing helpers", () => {
  it("parses fractional, direct, invalid, and zero frame rates", () => {
    expect(parseRate("30000/1001")).toBe(29.97);
    expect(parseRate("24/1")).toBe(24);
    expect(parseRate("24")).toBe(24);
    expect(parseRate("0/0")).toBeUndefined();
    expect(parseRate("nope")).toBeUndefined();
  });

  it("parses numeric strings and rejects invalid numeric strings", () => {
    expect(parseNumber("128000")).toBe(128000);
    expect(parseNumber("12.5")).toBe(12.5);
    expect(parseNumber("nope")).toBeUndefined();
  });
});

describe("normalizeProbe", () => {
  it("normalizes normal video metadata with audio", () => {
    expect(normalizeProbe("source.mp4", probe())).toMatchObject({
      fileName: "source.mp4",
      fileSize: 20_000_000,
      durationSeconds: 30.5,
      container: "mov,mp4,m4a,3gp,3g2,mj2",
      formatLongName: "QuickTime / MOV",
      videoCodec: "h264",
      audioCodec: "aac",
      trackCounts: { video: 1, audio: 1, subtitle: 0 },
      width: 1920,
      height: 1080,
      displayAspectRatio: "16:9",
      frameRate: 29.97,
      overallBitrate: 4_000_000,
      videoBitrate: 3_800_000,
      audioBitrate: 128_000,
      audioSampleRate: 48_000,
      audioChannels: 2,
      pixelFormat: "yuv420p",
      color: { space: "bt709", transfer: "bt709", primaries: "bt709" },
      rotation: "90deg",
      tags: { major_brand: "isom" },
      webFriendly: true,
      warnings: []
    });
  });

  it("normalizes silent videos, missing optionals, and unknown containers", () => {
    expect(normalizeProbe("silent.bin", { format: {}, streams: [{ codec_type: "video" }] })).toMatchObject({
      fileName: "silent.bin",
      fileSize: 0,
      durationSeconds: 0,
      container: "unknown",
      trackCounts: { video: 1, audio: 0, subtitle: 0 },
      webFriendly: false,
      warnings: ["Container is not a typical web delivery format. MP4 or WebM is recommended."]
    });
  });

  it("counts multiple video, audio, and subtitle streams", () => {
    expect(
      normalizeProbe("multi.mp4", {
        ...probe(),
        streams: [
          { codec_type: "video", codec_name: "h264" },
          { codec_type: "video", codec_name: "h264" },
          { codec_type: "audio", codec_name: "aac" },
          { codec_type: "audio", codec_name: "aac" },
          { codec_type: "subtitle", codec_name: "webvtt" }
        ]
      }).trackCounts
    ).toEqual({ video: 2, audio: 2, subtitle: 1 });
  });

  it("reads rotation from side data", () => {
    expect(
      normalizeProbe("rotated.mp4", {
        ...probe(),
        streams: [{ codec_type: "video", codec_name: "h264", side_data_list: [{ rotation: -90 }] }]
      }).rotation
    ).toBe("-90deg");
  });

  it("preserves compatibility warning behavior", () => {
    expect(
      normalizeProbe(
        "source.avi",
        probe({
          format: { format_name: "avi", bit_rate: "20000000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "prores",
              pix_fmt: "yuv422p10le"
            },
            {
              codec_type: "audio",
              codec_name: "pcm_s16le"
            }
          ]
        })
      ).warnings
    ).toEqual([
      "Container is not a typical web delivery format. MP4 or WebM is recommended.",
      "Video codec prores may have limited browser support.",
      "Audio codec pcm_s16le may have limited browser support.",
      "Pixel format yuv422p10le may not play reliably in all browsers.",
      "Overall bitrate is high for many web pages and may benefit from compression."
    ]);
  });
});
