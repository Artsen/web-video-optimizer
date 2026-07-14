import multer from "multer";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
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
  public importedUrl?: string;
  public lastOptimization?: Partial<OptimizationSettings>;
  public lastSample?: { settings: Partial<OptimizationSettings>; sampleSeconds?: unknown };
  public lastPosterAtSeconds?: unknown;
  public lastHistoryDelete?: { videoIds: string[]; jobIds: string[] };
  public lastCaptionUpdate?: string;
  public lastMuxSubtitleJobId?: string;
  public lastPackageBody?: unknown;
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

  async createVideoFromUrl(url: string): Promise<VideoRecordDto> {
    this.importedUrl = url;
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

  createOptimizationJob(
    _videoId: string,
    settings: Partial<OptimizationSettings>
  ): { status: 200 | 202; job?: JobDto } {
    this.lastOptimization = settings;
    return { status: 202, job: job({ id: "created-job", status: "queued", progress: 0 }) };
  }

  createSampleJob(
    _videoId: string,
    settings: Partial<OptimizationSettings>,
    sampleSeconds?: unknown
  ): { status: 200 | 202; job?: JobDto } {
    this.lastSample = { settings, sampleSeconds };
    return { status: 202, job: job({ id: "sample-job", kind: "sample", status: "queued", progress: 0 }) };
  }

  createPosterJob(_videoId: string, atSeconds?: unknown): JobDto | undefined {
    this.lastPosterAtSeconds = atSeconds;
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

  async createPackageJob(
    _videoId: string,
    body: unknown
  ): Promise<{ status: 201 | 400 | 404; job?: JobDto; error?: string }> {
    this.lastPackageBody = body;
    return { status: 201, job: job({ id: "package-job", kind: "package", outputFileName: "package.zip" }) };
  }

  async deleteHistory(videoIds: string[], jobIds: string[]): Promise<HistorySnapshot> {
    this.lastHistoryDelete = { videoIds, jobIds };
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

  async updateCaptions(id: string, vtt: string): Promise<JobDto | undefined> {
    this.lastCaptionUpdate = vtt;
    if (!this.jobs.has(id)) return undefined;
    return job({ id, kind: "subtitle", message: "Captions edited" });
  }

  createMuxSubtitleJob(
    _videoJobId: string,
    subtitleJobId: string
  ): { status: 202 | 400 | 404; job?: JobDto; error?: string } {
    this.lastMuxSubtitleJobId = subtitleJobId;
    return { status: 202, job: job({ id: "mux-job", kind: "mux" }) };
  }

  async revealJob(id: string): Promise<boolean> {
    return this.jobs.has(id);
  }

  async deleteJob(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }
}

function makeApp(runtime = new FakeRuntime(), config: { corsOrigins?: string[]; jsonBodyLimitBytes?: number } = {}) {
  return {
    runtime,
    app: createApp({
      config: {
        corsOrigins: config.corsOrigins ?? ["http://localhost:5173", "http://127.0.0.1:5173"],
        jsonBodyLimitBytes: config.jsonBodyLimitBytes ?? 5 * 1024 * 1024
      },
      runtime,
      upload: multer({ storage: multer.memoryStorage() }).single("video")
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

    const response = await request(app).post("/api/videos/url").send({ url: "https://example.com/video" }).expect(400);
    expect(response.body.error).toBe("Enter a valid YouTube URL.");
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

    const pair = await request(app).post("/api/videos/video-1/pair").send(settings()).expect(202);
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

describe("API middleware boundaries", () => {
  it("allows default local CORS origins and requests without Origin", async () => {
    const { app } = makeApp();

    await request(app)
      .get("/api/history")
      .set("Origin", "http://localhost:5173")
      .expect("Access-Control-Allow-Origin", "http://localhost:5173")
      .expect(200);
    await request(app)
      .get("/api/history")
      .set("Origin", "http://127.0.0.1:5173")
      .expect("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
      .expect(200);
    await request(app).get("/api/history").expect(200);
  });

  it("rejects denied browser origins including preflight", async () => {
    const { app } = makeApp();

    const denied = await request(app).get("/api/history").set("Origin", "https://evil.example").expect(403);
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    expect(denied.body).toEqual({ error: "Origin is not allowed.", code: "CORS_ORIGIN_DENIED" });

    await request(app).options("/api/history").set("Origin", "https://evil.example").expect(403);
  });

  it("preserves valid preflight behavior", async () => {
    const { app } = makeApp();

    await request(app)
      .options("/api/history")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .expect("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
      .expect("Access-Control-Allow-Headers", "Content-Type,Range")
      .expect(204);
  });

  it("sets security headers and removes Express fingerprinting", async () => {
    const { app } = makeApp();
    const response = await request(app).get("/health").expect(200);

    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("enforces JSON content type only for JSON routes", async () => {
    const { app } = makeApp();

    await request(app).patch("/api/videos/video-1").set("Content-Type", "text/plain").send("x").expect(415, {
      error: "Content-Type must be application/json.",
      code: "UNSUPPORTED_MEDIA_TYPE"
    });
    await request(app)
      .patch("/api/videos/video-1")
      .set("Content-Type", "application/json; charset=utf-8")
      .send({ originalName: "ok.mp4" })
      .expect(200);
    await request(app).post("/api/videos").attach("video", Buffer.from("fake"), "clip.mp4").expect(200);
  });

  it("handles invalid and oversized JSON bodies safely", async () => {
    const { app } = makeApp(undefined, { jsonBodyLimitBytes: 32 });

    await request(app)
      .patch("/api/videos/video-1")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400, { error: "Invalid JSON request body.", code: "INVALID_JSON" });
    await request(app)
      .put("/api/jobs/job-1/captions")
      .send({ vtt: "WEBVTT\n\n" + "x".repeat(64) })
      .expect(413, { error: "Request body is too large.", code: "REQUEST_TOO_LARGE" });
  });

  it("returns JSON 404 for unknown API routes without changing non-API 404 behavior", async () => {
    const { app } = makeApp();

    await request(app).get("/api/nope").expect(404, { error: "API route not found", code: "NOT_FOUND" });
    await request(app).get("/missing").expect(404);
  });

  it("returns generic unknown errors without leaking internal messages", async () => {
    class ThrowingRuntime extends FakeRuntime {
      override async createVideoFromUrl(): Promise<VideoRecordDto> {
        throw new Error("secret path C:\\video\\private.mp4");
      }
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app } = makeApp(new ThrowingRuntime());

    try {
      await request(app)
        .post("/api/videos/url")
        .send({ url: "https://youtube.com/watch?v=abc" })
        .expect(500, { error: "Unexpected server error", code: "INTERNAL_ERROR" });
    } finally {
      spy.mockRestore();
    }
  });

  it("preserves SSE headers", async () => {
    const { app } = makeApp();
    const response = await request(app).get("/api/jobs/job-1/events").expect(200);

    expect(response.headers["content-type"]).toContain("text/event-stream");
  });
});

describe("route validation boundaries", () => {
  it("validates optimization requests", async () => {
    const { app, runtime } = makeApp();
    await request(app).post("/api/videos/video-1/jobs").send({ crf: 40, videoCodec: "libx264" }).expect(202);
    expect(runtime.lastOptimization).toEqual({ crf: 40, videoCodec: "libx264" });

    await request(app).post("/api/videos/video-1/jobs").send({ videoCodec: "bad" }).expect(400);
    await request(app).post("/api/videos/video-1/jobs").send({ cpuUsed: 99 }).expect(400);
    await request(app).post("/api/videos/video-1/jobs").send({ crf: "40" }).expect(400);
    await request(app).post("/api/videos/video-1/jobs").send({ crf: null }).expect(400);
    await request(app).post("/api/videos/video-1/jobs").send({ extra: true }).expect(400);
  });

  it("validates sample and poster requests", async () => {
    const { app, runtime } = makeApp();

    await request(app).post("/api/videos/video-1/sample").send({ sampleSeconds: 3, crf: 28 }).expect(202);
    expect(runtime.lastSample).toEqual({ settings: { crf: 28 }, sampleSeconds: 3 });
    await request(app).post("/api/videos/video-1/sample").send({ sampleSeconds: 0 }).expect(400);
    await request(app).post("/api/videos/video-1/sample").send({ sampleSeconds: "3" }).expect(400);
    await request(app).post("/api/videos/video-1/sample").send({ extra: true }).expect(400);

    await request(app).post("/api/videos/video-1/poster").send({ atSeconds: 1.5 }).expect(202);
    expect(runtime.lastPosterAtSeconds).toBe(1.5);
    await request(app).post("/api/videos/video-1/poster").send({ atSeconds: -1 }).expect(400);
    await request(app).post("/api/videos/video-1/poster").send({ atSeconds: "1" }).expect(400);
    await request(app).post("/api/videos/video-1/poster").send({ extra: true }).expect(400);
  });

  it("accepts legacy pair settings bodies without using arbitrary fields", async () => {
    const { app } = makeApp();

    await request(app)
      .post("/api/videos/video-1/pair")
      .send(settings({ crf: 40 }))
      .expect(202);
    await request(app).post("/api/videos/video-1/pair").send({ unexpected: true }).expect(400);
  });

  it("validates rename requests", async () => {
    const { app } = makeApp();
    const longName = `${"a".repeat(256)}.mp4`;

    await request(app).patch("/api/videos/video-1").send({ originalName: "next.mp4" }).expect(200);
    await request(app).patch("/api/jobs/job-1").send({ outputFileName: "next.mp4" }).expect(200);

    for (const body of [
      { originalName: "" },
      { originalName: longName },
      { originalName: "bad/name.mp4" },
      { originalName: "bad\\name.mp4" },
      { originalName: "bad\0name.mp4" },
      { originalName: "bad\x1Fname.mp4" },
      { originalName: "next.mp4", extra: true }
    ]) {
      await request(app).patch("/api/videos/video-1").send(body).expect(400);
    }
  });

  it("validates history deletion bodies", async () => {
    const { app, runtime } = makeApp();

    await request(app)
      .post("/api/history/delete")
      .send({ videoIds: ["video-1", "video-1"], jobIds: ["job-1"] })
      .expect(200);
    expect(runtime.lastHistoryDelete).toEqual({ videoIds: ["video-1"], jobIds: ["job-1"] });
    await request(app).post("/api/history/delete").send({}).expect(200);
    expect(runtime.lastHistoryDelete).toEqual({ videoIds: [], jobIds: [] });
    await request(app).post("/api/history/delete").send({ videoIds: "video-1" }).expect(400);
    await request(app)
      .post("/api/history/delete")
      .send({ videoIds: ["../x"] })
      .expect(400);
    await request(app)
      .post("/api/history/delete")
      .send({ videoIds: Array.from({ length: 1001 }, (_, index) => `v${index}`) })
      .expect(400);
    await request(app).post("/api/history/delete").send({ extra: true }).expect(400);
  });

  it("validates caption update and mux bodies", async () => {
    const { app, runtime } = makeApp(undefined, { jsonBodyLimitBytes: 64 });

    await request(app).put("/api/jobs/job-1/captions").send({ vtt: "WEBVTT\n\nHi" }).expect(200);
    expect(runtime.lastCaptionUpdate).toBe("WEBVTT\n\nHi");
    await request(app).put("/api/jobs/job-1/captions").send({}).expect(400);
    await request(app).put("/api/jobs/job-1/captions").send({ vtt: {} }).expect(400);
    await request(app).put("/api/jobs/job-1/captions").send({ vtt: "WEBVTT", extra: true }).expect(400);

    await request(app).post("/api/jobs/job-1/mux-subtitles").send({ subtitleJobId: "subtitle-job" }).expect(202);
    expect(runtime.lastMuxSubtitleJobId).toBe("subtitle-job");
    await request(app).post("/api/jobs/job-1/mux-subtitles").send({}).expect(400);
    await request(app).post("/api/jobs/job-1/mux-subtitles").send({ subtitleJobId: "../subtitle" }).expect(400);
    await request(app)
      .post("/api/jobs/job-1/mux-subtitles")
      .send({ subtitleJobId: "subtitle-job", extra: true })
      .expect(400);
  });

  it("validates package requests", async () => {
    const { app, runtime } = makeApp();

    await request(app)
      .post("/api/videos/video-1/package")
      .send({ jobIds: ["job-1", "job-1"], metadata: { title: "Title", filenamePrefix: "site-video" } })
      .expect(201);
    expect(runtime.lastPackageBody).toEqual({
      jobIds: ["job-1"],
      metadata: { title: "Title", filenamePrefix: "site-video" }
    });
    await request(app).post("/api/videos/video-1/package").send({ jobIds: "job-1" }).expect(400);
    await request(app).post("/api/videos/video-1/package").send({ extra: true }).expect(400);
    await request(app)
      .post("/api/videos/video-1/package")
      .send({ jobIds: Array.from({ length: 1001 }, (_, index) => `j${index}`) })
      .expect(400);
    await request(app)
      .post("/api/videos/video-1/package")
      .send({ metadata: { filenamePrefix: "../bad" } })
      .expect(400);
  });

  it("validates YouTube import URLs with URL parsing and exact hostnames", async () => {
    const { app, runtime } = makeApp();

    await request(app).post("/api/videos/url").send({ url: "https://www.youtube.com/watch?v=abc" }).expect(200);
    expect(runtime.importedUrl).toBe("https://www.youtube.com/watch?v=abc");
    await request(app).post("/api/videos/url").send({ url: "https://youtu.be/abc" }).expect(200);
    expect(runtime.importedUrl).toBe("https://youtu.be/abc");

    for (const url of [
      "http://youtube.com/watch?v=x",
      "https://user:pass@youtube.com/watch?v=x",
      "https://youtube.com:8443/watch?v=x",
      "https://youtube.com.evil.example/watch?v=x",
      "https://evil.example/youtube.com/watch?v=x",
      "https://127.0.0.1/watch?v=x",
      "javascript:alert(1)",
      "https://youtube.com@evil.example/",
      "https://evil.example/?next=https://youtube.com/"
    ]) {
      await request(app).post("/api/videos/url").send({ url }).expect(400);
    }
    await request(app).post("/api/videos/url").send({ url: {} }).expect(400);
    await request(app).post("/api/videos/url").send({ url: "https://youtube.com/watch?v=x", extra: true }).expect(400);
  });

  it("rejects malicious path parameter boundaries", async () => {
    const { app } = makeApp();

    await request(app)
      .get(`/api/jobs/${"a".repeat(129)}`)
      .expect(400);
    await request(app).get("/api/jobs/%2e%2e%2f").expect(400);
    await request(app).get("/api/jobs/bad%00id").expect(400);
  });
});
