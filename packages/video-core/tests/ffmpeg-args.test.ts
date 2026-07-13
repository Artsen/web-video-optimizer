import { describe, expect, it } from "vitest";
import { buildFfmpegArgs, normalizeOptimizationSettings } from "../src/index.js";

describe("buildFfmpegArgs", () => {
  it("builds exact MP4/H.264/AAC arguments", () => {
    const args = buildFfmpegArgs(
      "input path.mp4",
      "output path.mp4",
      normalizeOptimizationSettings({
        width: 1280,
        frameRate: 24,
        audioMode: "compress",
        audioBitrateKbps: 128,
        audioSampleRate: 48000,
        audioChannels: 2,
        fastStart: true,
        stripMetadata: true
      })
    );

    expect(args).toEqual([
      "-y",
      "-i",
      "input path.mp4",
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
      "output path.mp4"
    ]);
  });

  it("builds WebM/AV1/Opus arguments", () => {
    expect(
      buildFfmpegArgs(
        "input.mp4",
        "output.webm",
        normalizeOptimizationSettings({ outputContainer: "webm", videoCodec: "libaom-av1", crf: 36, cpuUsed: 5 })
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
      "libaom-av1",
      "-crf",
      "36",
      "-b:v",
      "0",
      "-cpu-used",
      "5",
      "-row-mt",
      "1",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "libopus",
      "-b:a",
      "128k",
      "-map_metadata",
      "-1",
      "output.webm"
    ]);
  });

  it("builds WebM/VP9/Opus arguments", () => {
    const args = buildFfmpegArgs(
      "input.mp4",
      "output.webm",
      normalizeOptimizationSettings({ videoCodec: "libvpx-vp9", cpuUsed: 4 })
    );
    expect(args).toContain("-deadline");
    expect(args).toContain("good");
    expect(args).toContain("libvpx-vp9");
    expect(args.at(-1)).toBe("output.webm");
  });

  it("supports audio removal, height-only scaling, frame-rate filtering, and duration limit", () => {
    expect(
      buildFfmpegArgs(
        "input.mp4",
        "sample.mp4",
        normalizeOptimizationSettings({ height: 720, frameRate: 30, audioMode: "remove" }),
        5
      )
    ).toEqual([
      "-y",
      "-i",
      "input.mp4",
      "-map",
      "0:v:0",
      "-c:v",
      "libx264",
      "-crf",
      "24",
      "-preset",
      "medium",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=-2:720:force_original_aspect_ratio=decrease,fps=30",
      "-an",
      "-map_metadata",
      "-1",
      "-movflags",
      "+faststart",
      "-t",
      "5",
      "sample.mp4"
    ]);
  });

  it("omits metadata stripping and MP4 fast-start when disabled", () => {
    const args = buildFfmpegArgs(
      "input.mp4",
      "output.mp4",
      normalizeOptimizationSettings({ stripMetadata: false, fastStart: false })
    );
    expect(args).not.toContain("-map_metadata");
    expect(args).not.toContain("-movflags");
  });
});
