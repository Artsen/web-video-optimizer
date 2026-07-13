import multer from "multer";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  CapabilitiesSchema,
  HistorySnapshotSchema,
  JobDtoSchema,
  VideoRecordDtoSchema,
  type Capabilities,
  type HistorySnapshot,
  type JobDto,
  type OptimizationSettings,
  type VideoMetadata,
  type VideoRecordDto
} from "@local-video-optimizer/contracts";
import { createApp } from "./app.js";
import type { ApiRuntime, CaptionPayload, StreamDescriptor, UploadedVideoFile } from "./runtime/api-runtime.js";

function metadata(overrides: Partial<VideoMetadata> = {}): VideoMetadata {
  return {
    fileName: "source.mp4",
    fileSize: 1234,
    durationSeconds: 12,
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    videoCodec: "h264",
    audioCodec: "aac",
    trackCounts: { video: 1, audio: 1, subtitle: 0 },
    width: 1280,
    height: 720,
    frameRate: 24,
    pixelFormat: "yuv420p",
    webFriendly: true,
    warnings: [],
    ...overrides
  };
}

function settings(overrides: Partial<OptimizationSettings> = {}): OptimizationSettings {
  return {
    outputContainer: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    crf: 26,
    preset: "slow",
    audioMode: "compress",
    audioBitrateKbps: 128,
    fastStart: true,
    stripMetadata: true,
    outputFilename: "optimized",
    ...overrides
  };
}

function video(overrides: Partial<VideoRecordDto> = {}): VideoRecordDto {
  return {
    id: "video-1",
    originalName: "source.mp4",
    uploadedAt: "2026-07-13T12:00:00.000Z",
    metadata: metadata(),
    ...overrides
  };
}

function job(overrides: Partial<JobDto> = {}): JobDto {
  return {
    id: "job-1",
    videoId: "video-1",
    status: "completed",
    kind: "encode",
    progress: 100,
    message: "Done",
    outputFileName: "optimized.mp4",
    outputSize: 456,
    ffmpegCommand: "ffmpeg -i source.mp4 optimized.mp4",
    startedAt: "2026-07-13T12:01:00.000Z",
    completedAt: "2026-07-13T12:02:00.000Z",
    settings: settings(),
    ...overrides
  };
}

function noPrivateFields(value: unknown): void {
  const text = JSON.stringify(value);
  expect(text).not.toContain("storedPath");
  expect(text).not.toContain("outputPath");
  expect(text).not.toContain("sidecarPath");
  expect(text).not.toContain("sourceHash");
}

class FakeRuntime implements ApiRuntime {
  public uploaded?: UploadedVideoFile;
  public videos = new Map<string, VideoRecordDto>([["video-1", video()]]);
  public jobs = new Map<string, JobDto>([["job-1", job()]]);

  async initialize(): Promise<void> {}

  async getCapabilities(): Promise<Capabilities> {
    return {
      libx264: true,
      libaomAv1: true,
      libvpxVp9: true,
      aac: true,
      libopus: true,
      whisperCpp: false,
      whisperModel: false,
      ytDlp: false
    };
  }

  getHistory(): HistorySnapshot {
    const videos = Array.from(this.videos.values()).map((item) => ({ ...item, jobIds: ["job-1"] }));
    return { videos, jobs: Array.from(this.jobs.values()) };
  }

  async createVideoFromUpload(file: UploadedVideoFile): Promise<VideoRecordDto> {
    this.uploaded = file;
    return video({ id: "uploaded-video", originalName: file.originalName });
  }

  async createVideoFromUrl(): Promise<VideoRecordDto> {
    return video({ id: "imported-video", originalName: "youtube.mp4" });
  }

  getVideo(id: string): VideoRecordDto | undefined {
    return this.videos.get(id);
  }

  getVideoMetadata(id: string): VideoMetadata | undefined {
    return this.videos.get(id)?.metadata;
  }

  getVideoSource(id: string): StreamDescriptor | undefined {
    return this.videos.has(id) ? { filePath: "unused.mp4", fileName: "source.mp4" } : undefined;
  }

  getVideoDownload(id: string): StreamDescriptor | undefined {
    return this.getVideoSource(id);
  }

  async renameVideo(id: string, originalName: string): Promise<VideoRecordDto | undefined> {
    if (!this.videos.has(id)) return undefined;
    return video({ id, originalName });
  }

  async deleteVideo(id: string): Promise<boolean> {
    return this.videos.delete(id);
  }

  createOptimizationJob(): { status: 200 | 202; job?: JobDto } {
    return { status: 202, job: job({ id: "created-job", status: "queued", progress: 0 }) };
  }

  createSampleJob(): { status: 200 | 202; job?: JobDto } {
    return { status: 202, job: job({ id: "sample-job", kind: "sample", status: "queued", progress: 0 }) };
  }

  createPosterJob(): JobDto | undefined {
    return job({ id: "poster-job", kind: "poster", outputFileName: "poster.webp" });
  }

  createSubtitleJob(): { status: 200 | 202 | 400 | 404; job?: JobDto; error?: string } {
    return { status: 202, job: job({ id: "subtitle-job", kind: "subtitle", outputFileName: "captions.vtt" }) };
  }

  createPairJobs(): { jobs: JobDto[] } | undefined {
    return {
      jobs: [job({ id: "fallback-job" }), job({ id: "modern-job", settings: settings({ outputContainer: "webm" }) })]
    };
  }

  async createPackageJob(): Promise<{ status: 201 | 400 | 404; job?: JobDto; error?: string }> {
    return { status: 201, job: job({ id: "package-job", kind: "package", outputFileName: "package.zip" }) };
  }

  async deleteHistory(): Promise<HistorySnapshot> {
    return { videos: [], jobs: [] };
  }

  getJob(id: string): JobDto | undefined {
    return this.jobs.get(id);
  }

  async renameJob(id: string, outputFileName: string): Promise<JobDto | undefined> {
    if (!this.jobs.has(id)) return undefined;
    return job({ id, outputFileName });
  }

  async cancelJob(id: string): Promise<JobDto | undefined> {
    if (!this.jobs.has(id)) return undefined;
    return job({ id, status: "canceled", message: "Canceled and removed" });
  }

  getJobDownload(): StreamDescriptor | undefined {
    return { filePath: "unused.mp4", fileName: "optimized.mp4" };
  }

  getJobSidecar(): StreamDescriptor | undefined {
    return { filePath: "unused.srt", fileName: "captions.srt" };
  }

  getJobOutput(): StreamDescriptor | undefined {
    return { filePath: "unused.mp4", fileName: "optimized.mp4" };
  }

  async getCaptions(): Promise<CaptionPayload | undefined> {
    return { vtt: "WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n", srt: "1\n00:00,000 --> 00:01,000\nHello\n" };
  }

  async updateCaptions(id: string): Promise<JobDto | undefined> {
    if (!this.jobs.has(id)) return undefined;
    return job({ id, kind: "subtitle", message: "Captions edited" });
  }

  createMuxSubtitleJob(): { status: 202 | 400 | 404; job?: JobDto; error?: string } {
    return { status: 202, job: job({ id: "mux-job", kind: "mux" }) };
  }

  async revealJob(id: string): Promise<boolean> {
    return this.jobs.has(id);
  }

  async deleteJob(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }
}

function makeApp(runtime = new FakeRuntime()) {
  return {
    runtime,
    app: createApp({
      config: { corsOrigin: true },
      runtime,
      upload: multer({ storage: multer.memoryStorage() })
    })
  };
}

describe("createApp", () => {
  it("returns an app that can be tested without opening a port", async () => {
    const { app } = makeApp();
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("keeps unknown route behavior as a 404", async () => {
    const { app } = makeApp();

    await request(app).get("/missing").expect(404);
  });

  it("keeps JSON middleware active", async () => {
    const { app } = makeApp();
    const response = await request(app).patch("/api/videos/video-1").send({ originalName: "renamed.mp4" });

    expect(response.status).toBe(200);
    expect(response.body.originalName).toBe("renamed.mp4");
  });
});

describe("public API response shapes", () => {
  it("returns capabilities matching the shared schema", async () => {
    const { app } = makeApp();
    const response = await request(app).get("/api/capabilities").expect(200);

    CapabilitiesSchema.parse(response.body);
    noPrivateFields(response.body);
  });

  it("returns history matching the shared schema without private fields", async () => {
    const { app } = makeApp();
    const response = await request(app).get("/api/history").expect(200);

    HistorySnapshotSchema.parse(response.body);
    noPrivateFields(response.body);
  });

  it("returns empty history matching the shared schema", async () => {
    class EmptyHistoryRuntime extends FakeRuntime {
      override getHistory(): HistorySnapshot {
        return { videos: [], jobs: [] };
      }
    }
    const { app } = makeApp(new EmptyHistoryRuntime());
    const response = await request(app).get("/api/history").expect(200);

    expect(response.body).toEqual({ videos: [], jobs: [] });
    HistorySnapshotSchema.parse(response.body);
    noPrivateFields(response.body);
  });

  it("uploads through the multipart boundary and returns a public video DTO", async () => {
    const { app, runtime } = makeApp();
    const response = await request(app)
      .post("/api/videos")
      .attach("video", Buffer.from("fake"), "clip.mp4")
      .expect(200);

    expect(runtime.uploaded?.originalName).toBe("clip.mp4");
    VideoRecordDtoSchema.parse(response.body);
    noPrivateFields(response.body);
  });

  it("imports a YouTube URL and returns a public video DTO", async () => {
    const { app } = makeApp();
    const response = await request(app)
      .post("/api/videos/url")
      .send({ url: "https://www.youtube.com/watch?v=abc" })
      .expect(200);

    VideoRecordDtoSchema.parse(response.body);
    noPrivateFields(response.body);
  });

  it("rejects invalid import URLs with the existing status and message", async () => {
    const { app } = makeApp();

    await request(app)
      .post("/api/videos/url")
      .send({ url: "https://example.com/video" })
      .expect(400, { error: "Enter a valid YouTube URL." });
  });

  it("creates and reads jobs as public job DTOs", async () => {
    const { app } = makeApp();
    const created = await request(app).post("/api/videos/video-1/jobs").send(settings()).expect(202);
    const existing = await request(app).get("/api/jobs/job-1").expect(200);

    JobDtoSchema.parse(created.body);
    JobDtoSchema.parse(existing.body);
    noPrivateFields(created.body);
    noPrivateFields(existing.body);
  });

  it("returns 404 for missing videos and jobs", async () => {
    const { app } = makeApp();

    await request(app)
      .patch("/api/videos/missing")
      .send({ originalName: "x.mp4" })
      .expect(404, { error: "Video not found" });
    await request(app).get("/api/jobs/missing").expect(404, { error: "Job not found" });
  });

  it("updates job names, cancels jobs, and deletes jobs through route handlers", async () => {
    const { app } = makeApp();

    const renamed = await request(app).patch("/api/jobs/job-1").send({ outputFileName: "next.mp4" }).expect(200);
    const canceled = await request(app).post("/api/jobs/job-1/cancel").expect(200);
    await request(app).delete("/api/jobs/job-1").expect(204);

    JobDtoSchema.parse(renamed.body);
    JobDtoSchema.parse(canceled.body);
    noPrivateFields(renamed.body);
    noPrivateFields(canceled.body);
  });

  it("handles caption routes through public job and caption payloads", async () => {
    const { app } = makeApp();

    const generated = await request(app).post("/api/videos/video-1/subtitles").expect(202);
    const captions = await request(app).get("/api/jobs/job-1/captions").expect(200);
    const edited = await request(app)
      .put("/api/jobs/job-1/captions")
      .send({ vtt: "WEBVTT\n\n00:00.000 --> 00:01.000\nHi" })
      .expect(200);
    const muxed = await request(app)
      .post("/api/jobs/job-1/mux-subtitles")
      .send({ subtitleJobId: "subtitle-job" })
      .expect(202);

    JobDtoSchema.parse(generated.body);
    expect(captions.body).toHaveProperty("vtt");
    expect(captions.body).toHaveProperty("srt");
    JobDtoSchema.parse(edited.body);
    JobDtoSchema.parse(muxed.body);
    noPrivateFields({ generated: generated.body, captions: captions.body, edited: edited.body, muxed: muxed.body });
  });

  it("creates pair and package jobs without leaking private fields", async () => {
    const { app } = makeApp();

    const pair = await request(app).post("/api/videos/video-1/pair").expect(202);
    const packaged = await request(app)
      .post("/api/videos/video-1/package")
      .send({ jobIds: ["job-1"] })
      .expect(201);

    expect(pair.body.jobs).toHaveLength(2);
    pair.body.jobs.forEach((item: unknown) => JobDtoSchema.parse(item));
    JobDtoSchema.parse(packaged.body);
    noPrivateFields({ pair: pair.body, packaged: packaged.body });
  });

  it("streams job output with content type and byte-range handling", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "video-api-route-"));
    const filePath = path.join(directory, "output.webm");
    await writeFile(filePath, Buffer.from("0123456789"));
    class StreamingRuntime extends FakeRuntime {
      override getJobOutput(): StreamDescriptor | undefined {
        return { filePath, fileName: "output.webm" };
      }
    }

    try {
      const { app } = makeApp(new StreamingRuntime());
      const range = await request(app).get("/api/jobs/job-1/output").set("Range", "bytes=-4").expect(206);

      expect(range.headers["content-type"]).toContain("video/webm");
      expect(range.headers["content-range"]).toBe("bytes 6-9/10");
      expect(Buffer.from(range.body as Buffer).toString()).toBe("6789");

      await request(app).get("/api/jobs/job-1/output").set("Range", "bytes=99-").expect(416);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
