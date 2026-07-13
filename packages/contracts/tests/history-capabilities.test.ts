import { describe, expect, it } from "vitest";
import { CapabilitiesSchema, HistorySnapshotSchema, PackageRequestSchema } from "../src/index.js";

describe("capabilities and history contracts", () => {
  it("accepts a full capability response", () => {
    expect(
      CapabilitiesSchema.safeParse({
        libx264: true,
        libaomAv1: true,
        libvpxVp9: true,
        aac: true,
        libopus: true,
        whisperCpp: true,
        whisperModel: true,
        whisperCommand: "whisper-cli",
        whisperModelPath: "D:\\ggml-base.en.bin",
        ytDlp: true,
        ytDlpCommand: "yt-dlp",
        ytDlpJsRuntime: "node:C:\\Program Files\\nodejs\\node.exe"
      }).success
    ).toBe(true);
  });

  it("accepts optional Whisper and downloader information", () => {
    expect(
      CapabilitiesSchema.safeParse({
        libx264: true,
        libaomAv1: false,
        libvpxVp9: false,
        aac: true,
        libopus: true
      }).success
    ).toBe(true);
  });

  it("accepts history snapshots with videos and jobs", () => {
    expect(
      HistorySnapshotSchema.safeParse({
        videos: [
          {
            id: "video-1",
            originalName: "homepage-video.mp4",
            uploadedAt: "2026-06-23T03:19:18.830Z",
            metadata: {
              fileName: "homepage-video.mp4",
              fileSize: 1000,
              durationSeconds: 41,
              container: "mp4",
              trackCounts: { video: 1, audio: 1, subtitle: 0 },
              webFriendly: true,
              warnings: []
            },
            jobIds: ["job-1"]
          }
        ],
        jobs: [
          {
            id: "job-1",
            videoId: "video-1",
            kind: "poster",
            status: "completed",
            progress: 100,
            outputFileName: "homepage-video-poster.webp",
            outputSize: 2222,
            ffmpegCommand: "ffmpeg -i input.mp4 poster.webp",
            startedAt: "2026-06-23T03:19:18.830Z",
            completedAt: "2026-06-23T03:20:18.830Z",
            settings: {
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
            }
          }
        ]
      }).success
    ).toBe(true);
  });

  it("accepts empty history", () => {
    expect(HistorySnapshotSchema.safeParse({ videos: [], jobs: [] }).success).toBe(true);
  });

  it("accepts package selection request data", () => {
    expect(
      PackageRequestSchema.safeParse({
        jobIds: ["job-1", "job-2"],
        metadata: {
          title: "Homepage Video",
          description: "A web-ready product video.",
          language: "en",
          filenamePrefix: "homepage-video"
        }
      }).success
    ).toBe(true);
  });
});
