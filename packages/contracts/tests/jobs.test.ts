import { describe, expect, it } from "vitest";
import { JobDtoSchema, JobKindSchema, JobStatusSchema, type JobDto } from "../src/index.js";

const completedJob: JobDto = {
  id: "job-1",
  videoId: "video-1",
  kind: "encode",
  status: "completed",
  progress: 100,
  message: "Done",
  outputFileName: "homepage-video-fallback-h264.mp4",
  outputSize: 123456,
  ffmpegCommand: "ffmpeg -i input.mp4 output.mp4",
  startedAt: "2026-06-23T03:19:18.830Z",
  completedAt: "2026-06-23T03:20:18.830Z",
  settings: {
    outputContainer: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    width: 1280,
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
    outputFilename: "homepage-video-fallback-h264"
  }
};

describe("job contracts", () => {
  it("accepts every valid job status", () => {
    for (const status of ["queued", "running", "completed", "failed", "canceled"]) {
      expect(JobStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("accepts every valid job kind", () => {
    for (const kind of ["encode", "sample", "poster", "package", "subtitle", "mux"]) {
      expect(JobKindSchema.safeParse(kind).success).toBe(true);
    }
  });

  it("accepts a completed job with output metadata", () => {
    expect(JobDtoSchema.safeParse(completedJob).success).toBe(true);
  });

  it("accepts a running job without output metadata", () => {
    expect(
      JobDtoSchema.safeParse({
        id: completedJob.id,
        videoId: completedJob.videoId,
        kind: completedJob.kind,
        status: "running",
        progress: 44,
        message: "Encoding",
        ffmpegCommand: completedJob.ffmpegCommand,
        startedAt: completedJob.startedAt,
        settings: completedJob.settings
      }).success
    ).toBe(true);
  });

  it("accepts sample-estimate data", () => {
    expect(
      JobDtoSchema.safeParse({
        ...completedJob,
        kind: "sample",
        sampleEstimate: {
          sampleSeconds: 5,
          estimatedFullSize: 987654,
          estimatedReduction: 72
        }
      }).success
    ).toBe(true);
  });

  it("rejects invalid progress and malformed identifiers", () => {
    expect(JobDtoSchema.safeParse({ ...completedJob, progress: 101 }).success).toBe(false);
    expect(JobDtoSchema.safeParse({ ...completedJob, id: "" }).success).toBe(false);
  });
});
