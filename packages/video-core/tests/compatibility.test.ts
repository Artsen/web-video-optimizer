import { describe, expect, it } from "vitest";
import { analyzeWebFriendliness } from "../src/index.js";
import type { VideoMetadata } from "@local-video-optimizer/contracts";

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

describe("analyzeWebFriendliness", () => {
  it("marks common MP4/H.264/AAC/yuv420p sources as web friendly", () => {
    expect(analyzeWebFriendliness(metadata())).toEqual({ webFriendly: true, warnings: [] });
  });

  it("warns about unusual containers, codecs, pixel format, and high bitrate", () => {
    expect(
      analyzeWebFriendliness(
        metadata({
          container: "avi",
          videoCodec: "prores",
          audioCodec: "pcm_s16le",
          pixelFormat: "yuv422p10le",
          overallBitrate: 20_000_000
        })
      )
    ).toEqual({
      webFriendly: false,
      warnings: [
        "Container is not a typical web delivery format. MP4 or WebM is recommended.",
        "Video codec prores may have limited browser support.",
        "Audio codec pcm_s16le may have limited browser support.",
        "Pixel format yuv422p10le may not play reliably in all browsers.",
        "Overall bitrate is high for many web pages and may benefit from compression."
      ]
    });
  });
});
