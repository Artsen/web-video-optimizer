import { describe, expect, it } from "vitest";
import { VideoMetadataSchema, type VideoMetadata } from "../src/index.js";

const normalVideo: VideoMetadata = {
  fileName: "homepage-video.mp4",
  fileSize: 10_000_000,
  durationSeconds: 41,
  container: "mov,mp4,m4a,3gp,3g2,mj2",
  formatLongName: "QuickTime / MOV",
  videoCodec: "h264",
  audioCodec: "aac",
  trackCounts: { video: 1, audio: 1, subtitle: 0 },
  width: 1920,
  height: 1080,
  displayAspectRatio: "16:9",
  frameRate: 29.97,
  overallBitrate: 1_950_000,
  videoBitrate: 1_800_000,
  audioBitrate: 128_000,
  audioSampleRate: 48000,
  audioChannels: 2,
  pixelFormat: "yuv420p",
  color: {
    space: "bt709",
    transfer: "bt709",
    primaries: "bt709"
  },
  rotation: "0",
  tags: {
    major_brand: "isom"
  },
  webFriendly: true,
  warnings: []
};

describe("VideoMetadataSchema", () => {
  it("accepts normal video metadata with audio", () => {
    expect(VideoMetadataSchema.safeParse(normalVideo).success).toBe(true);
  });

  it("accepts silent video metadata", () => {
    expect(
      VideoMetadataSchema.safeParse({
        ...normalVideo,
        audioCodec: undefined,
        audioBitrate: undefined,
        audioSampleRate: undefined,
        audioChannels: undefined,
        trackCounts: { video: 1, audio: 0, subtitle: 0 }
      }).success
    ).toBe(true);
  });

  it("accepts optional color information", () => {
    expect(VideoMetadataSchema.safeParse({ ...normalVideo, color: undefined }).success).toBe(true);
    expect(VideoMetadataSchema.safeParse({ ...normalVideo, color: { transfer: "smpte2084" } }).success).toBe(true);
  });

  it("accepts multiple stream counts and compatibility warnings", () => {
    expect(
      VideoMetadataSchema.safeParse({
        ...normalVideo,
        trackCounts: { video: 2, audio: 3, subtitle: 1 },
        webFriendly: false,
        warnings: ["Overall bitrate is high for many web pages and may benefit from compression."]
      }).success
    ).toBe(true);
  });

  it("accepts missing optional metadata", () => {
    expect(
      VideoMetadataSchema.safeParse({
        fileName: "clip.webm",
        fileSize: 2000,
        durationSeconds: 3.5,
        container: "matroska,webm",
        trackCounts: { video: 1, audio: 0, subtitle: 0 },
        webFriendly: true,
        warnings: []
      }).success
    ).toBe(true);
  });
});
