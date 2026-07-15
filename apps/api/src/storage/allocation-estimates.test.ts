import { describe, expect, it } from "vitest";
import { normalizeOptimizationSettings } from "@local-video-optimizer/video-core";
import type { JobEntity } from "../entities/job-entity.js";
import type { VideoEntity } from "../entities/video-entity.js";
import {
  estimateEncodeAllocation,
  estimateImportAllocation,
  estimateMuxAllocation,
  estimatePackageAllocation,
  estimatePosterAllocation,
  estimateSampleAllocation,
  estimateSubtitleAllocation
} from "./allocation-estimates.js";

function video(overrides: Partial<VideoEntity> = {}): VideoEntity {
  return {
    id: "video-1",
    originalName: "source.mp4",
    storedPath: "uploads/source.mp4",
    uploadedAt: "2026-07-15T00:00:00.000Z",
    metadata: {
      fileName: "source.mp4",
      fileSize: 10_000_000,
      durationSeconds: 20,
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      trackCounts: { video: 1, audio: 1, subtitle: 0 },
      width: 1920,
      height: 1080,
      frameRate: 30,
      overallBitrate: 5_000_000,
      webFriendly: true,
      warnings: []
    },
    ...overrides
  };
}

function job(overrides: Partial<JobEntity> = {}): JobEntity {
  return {
    id: "job-1",
    videoId: "video-1",
    kind: "encode",
    status: "completed",
    progress: 100,
    outputFileName: "output.mp4",
    outputSize: 4_000_000,
    ffmpegCommand: "ffmpeg",
    startedAt: "2026-07-15T00:00:00.000Z",
    settings: normalizeOptimizationSettings({ outputFilename: "output" }),
    ...overrides
  };
}

describe("storage allocation estimates", () => {
  it("uses conservative positive floors for each media operation", () => {
    const source = video();
    const settings = normalizeOptimizationSettings({ outputFilename: "site-video", width: 1280, frameRate: 24 });

    expect(estimateEncodeAllocation(source, settings)).toBeGreaterThan(3_500_000);
    expect(estimateSampleAllocation(source, settings, 5)).toBeGreaterThan(1_000_000);
    expect(estimatePosterAllocation()).toBeGreaterThanOrEqual(1024 * 1024);
    expect(estimateSubtitleAllocation(source)).toBeGreaterThan(600_000);
    expect(estimateMuxAllocation(job({ outputSize: 7_000_000 }))).toBeGreaterThan(7_000_000);
    expect(estimatePackageAllocation([job({ outputSize: 1_000_000 }), job({ outputSize: 2_000_000 })])).toBeGreaterThan(
      3_000_000
    );
    expect(estimateImportAllocation(50_000_000)).toBeGreaterThan(50_000_000);
  });

  it("handles sparse metadata without returning zero or unsafe values", () => {
    const sparse = video({
      metadata: {
        ...video().metadata,
        fileSize: 0,
        durationSeconds: 0,
        overallBitrate: undefined
      }
    });
    const settings = normalizeOptimizationSettings({});

    expect(estimateEncodeAllocation(sparse, settings)).toBeGreaterThan(0);
    expect(estimateSampleAllocation(sparse, settings, 999)).toBeGreaterThan(0);
    expect(estimateSubtitleAllocation(sparse)).toBeGreaterThan(0);
  });
});
