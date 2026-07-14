import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobDto, OptimizationSettings } from "@local-video-optimizer/contracts";
import { normalizeOptimizationSettings } from "@local-video-optimizer/video-core";
import type { JobEntity } from "../entities/job-entity.js";
import type { VideoEntity } from "../entities/video-entity.js";
import { InMemoryProcessRegistry } from "../infrastructure/processes/in-memory-process-registry.js";
import { FakeProcessRunner } from "../infrastructure/processes/test/fake-process-runner.js";
import type { FileRevealer } from "../infrastructure/desktop/file-revealer.js";
import type { WhisperAdapter } from "../infrastructure/tools/whisper-adapter.js";
import { InMemoryJobRepository } from "../repositories/in-memory-job-repository.js";
import { InMemoryVideoRepository } from "../repositories/in-memory-video-repository.js";
import { InMemoryJobScheduler } from "../scheduling/in-memory-job-scheduler.js";
import { CaptionService } from "./caption-service.js";
import { CleanupService } from "./cleanup-service.js";
import { buildMuxSubtitleArgs, JobExecutionService, type JobExecutor } from "./job-execution-service.js";
import { JobLifecycleService } from "./job-lifecycle-service.js";
import { JobService } from "./job-service.js";
import { PackageService } from "./package-service.js";
import type { RecoveryReport, StatePersistenceService } from "./state-persistence-service.js";

const tempDirs: string[] = [];
const processPolicy = {
  timeoutMs: 1_800_000,
  terminationGracePeriodMs: 5_000,
  maxCapturedOutputBytes: 4 * 1024 * 1024
};

class FakePersistence implements StatePersistenceService {
  saves = 0;

  async fileHash(): Promise<string> {
    return "hash";
  }

  async save(): Promise<void> {
    this.saves += 1;
  }

  scheduleSave(): void {
    this.saves += 1;
  }

  async flush(): Promise<void> {}

  async load(): Promise<RecoveryReport> {
    return {
      manifestSource: "none",
      restoredVideos: 0,
      restoredJobs: 0,
      canceledInterruptedJobs: 0,
      failedMissingOutputJobs: 0,
      skippedDanglingJobs: 0,
      removedPartialArtifacts: 0,
      recoveredFromBackup: false
    };
  }
}

class FakeExecution implements JobExecutor {
  encodeCalls: Array<{ job: JobEntity; inputPath: string; durationLimitSeconds?: number }> = [];
  posterCalls: Array<{ job: JobEntity; inputPath: string; atSeconds: number }> = [];
  muxCalls: Array<{ job: JobEntity; videoJob: JobEntity; subtitleJob: JobEntity }> = [];

  async runEncode(job: JobEntity, inputPath: string, durationLimitSeconds?: number): Promise<void> {
    this.encodeCalls.push({ job, inputPath, durationLimitSeconds });
  }

  async runPoster(job: JobEntity, inputPath: string, atSeconds: number): Promise<void> {
    this.posterCalls.push({ job, inputPath, atSeconds });
  }

  async runMux(job: JobEntity, videoJob: JobEntity, subtitleJob: JobEntity): Promise<void> {
    this.muxCalls.push({ job, videoJob, subtitleJob });
  }
}

class FakeRevealer implements FileRevealer {
  revealed?: string;

  async reveal(filePath: string): Promise<void> {
    this.revealed = filePath;
  }
}

function whisper(command: string | undefined, model = true): WhisperAdapter {
  return {
    async resolveCommand() {
      return command;
    },
    modelPath() {
      return model ? "model.bin" : undefined;
    },
    hasModel() {
      return model;
    }
  };
}

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "web-video-remaining-services-"));
  tempDirs.push(dir);
  await mkdir(path.join(dir, "uploads"), { recursive: true });
  await mkdir(path.join(dir, "outputs"), { recursive: true });
  await mkdir(path.join(dir, "tmp"), { recursive: true });
  return dir;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function video(root: string, overrides: Partial<VideoEntity> = {}): VideoEntity {
  return {
    id: "video-1",
    originalName: "source file.mp4",
    storedPath: path.join(root, "uploads", "video-1.mp4"),
    uploadedAt: "2026-07-13T12:00:00.000Z",
    sourceHash: "hash-1",
    metadata: {
      fileName: "source file.mp4",
      fileSize: 1000,
      durationSeconds: 10,
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      trackCounts: { video: 1, audio: 1, subtitle: 0 },
      width: 1280,
      height: 720,
      frameRate: 24,
      webFriendly: true,
      warnings: []
    },
    ...overrides
  };
}

function settings(overrides: Partial<OptimizationSettings> = {}): OptimizationSettings {
  return normalizeOptimizationSettings({
    outputContainer: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    crf: 26,
    preset: "slow",
    audioMode: "compress",
    audioBitrateKbps: 128,
    fastStart: true,
    stripMetadata: true,
    outputFilename: "output",
    ...overrides
  });
}

function job(root: string, overrides: Partial<JobEntity> = {}): JobEntity {
  return {
    id: "job-1",
    videoId: "video-1",
    status: "completed",
    kind: "encode",
    progress: 100,
    outputPath: path.join(root, "outputs", "job-1-output.mp4"),
    outputFileName: "output.mp4",
    ffmpegCommand: "ffmpeg",
    startedAt: "2026-07-13T12:01:00.000Z",
    settings: settings(),
    ...overrides
  };
}

function zipEntryNames(buffer: Buffer): string[] {
  const names: string[] = [];
  let offset = 0;
  while (offset < buffer.length - 4) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    names.push(buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"));
    offset += 30 + nameLength + extraLength + compressedSize;
  }
  return names;
}

function makeJobService(root: string) {
  const videos = new InMemoryVideoRepository();
  const jobs = new InMemoryJobRepository();
  const persistence = new FakePersistence();
  const registry = new InMemoryProcessRegistry();
  const scheduler = new InMemoryJobScheduler(10);
  const lifecycle = new JobLifecycleService();
  const cleanup = new CleanupService(
    videos,
    jobs,
    registry,
    persistence,
    {
      uploadDir: path.join(root, "uploads"),
      outputDir: path.join(root, "outputs"),
      tmpDir: path.join(root, "tmp")
    },
    scheduler
  );
  const execution = new FakeExecution();
  const revealer = new FakeRevealer();
  const service = new JobService(
    videos,
    jobs,
    path.join(root, "outputs"),
    persistence,
    cleanup,
    execution,
    revealer,
    scheduler,
    lifecycle
  );
  return { videos, jobs, persistence, registry, cleanup, execution, revealer, service, scheduler, lifecycle };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("JobService", () => {
  it("creates optimization jobs, delegates execution, and preserves descriptors", async () => {
    const root = await tempRoot();
    const { videos, service, execution, jobs } = makeJobService(root);
    const source = video(root);
    videos.set(source);

    const result = service.createOptimizationJob(source.id, settings({ outputFilename: "custom name" }));

    expect(result.status).toBe(202);
    expect(execution.encodeCalls).toHaveLength(1);
    expect(execution.encodeCalls[0].inputPath).toBe(source.storedPath);
    expect(result.job?.outputFileName).toBe("custom-name.mp4");
    expect(service.getDownload(result.job!.id)).toBeUndefined();
    const entity = jobs.get(result.job!.id)!;
    entity.status = "completed";
    expect(service.getOutput(entity.id)).toEqual({ filePath: entity.outputPath, fileName: entity.outputFileName });
  });

  it("reuses queued, running, and completed jobs but not failed/canceled or missing completed outputs", async () => {
    const root = await tempRoot();
    const { videos, jobs, service, execution } = makeJobService(root);
    const source = video(root);
    videos.set(source);
    const reusable = job(root, { id: "queued", status: "queued" });
    jobs.set(reusable);

    expect(service.createOptimizationJob(source.id, settings()).job?.id).toBe("queued");
    reusable.status = "running";
    expect(service.createOptimizationJob(source.id, settings()).job?.id).toBe("queued");
    reusable.status = "completed";
    await writeFile(reusable.outputPath!, "output");
    expect(service.createOptimizationJob(source.id, settings()).status).toBe(200);
    reusable.status = "failed";
    const failedResult = service.createOptimizationJob(source.id, settings());
    expect(failedResult.job?.id).not.toBe("queued");
    reusable.status = "canceled";
    const canceledResult = service.createOptimizationJob(source.id, settings());
    expect(canceledResult.job?.id).not.toBe("queued");
    expect(execution.encodeCalls.length).toBeGreaterThan(0);
  });

  it("clamps sample/poster values, creates exact pair settings, and handles rename/cancel/delete", async () => {
    const root = await tempRoot();
    const { videos, jobs, service, execution, persistence } = makeJobService(root);
    const source = video(root, { metadata: { ...video(root).metadata, durationSeconds: 3 } });
    videos.set(source);

    const sample = service.createSampleJob(source.id, settings(), 99).job!;
    expect(sample.outputFileName).toBe("source-file-sample.mp4");
    expect(execution.encodeCalls.at(-1)?.durationLimitSeconds).toBe(3);

    const poster = service.createPosterJob(source.id, -10)!;
    expect(poster.outputFileName).toBe("source-file-poster.webp");
    expect(execution.posterCalls.at(-1)?.atSeconds).toBe(0);

    const pair = service.createPairJobs(source.id)!;
    expect(pair.jobs.map((item) => item.outputFileName)).toEqual([
      "source-file-fallback-h264.mp4",
      "source-file-modern-av1.webm"
    ]);
    expect(pair.jobs[0].settings).toMatchObject({ outputContainer: "mp4", videoCodec: "libx264", crf: 26 });
    expect(pair.jobs[1].settings).toMatchObject({
      outputContainer: "webm",
      videoCodec: "libaom-av1",
      crf: 36,
      rowMt: true
    });

    jobs.set(job(root, { id: "subtitle", kind: "subtitle", outputFileName: "old.vtt", sidecarFileName: "old.srt" }));
    await expect(service.rename("subtitle", "new name.vtt")).resolves.toMatchObject({
      outputFileName: "new-name.vtt",
      sidecarFileName: "new-name.srt"
    });

    const queued = job(root, { id: "cancel-me", status: "queued" });
    jobs.set(queued);
    await expect(service.cancel(queued.id)).resolves.toMatchObject({ id: queued.id, status: "canceled" });
    expect(jobs.get(queued.id)).toBeUndefined();
    const completed = job(root, { id: "completed" });
    jobs.set(completed);
    await expect(service.cancel(completed.id)).resolves.toMatchObject({ id: completed.id, status: "completed" });
    expect(persistence.saves).toBeGreaterThan(0);
  });
});

describe("JobExecutionService", () => {
  it("runs encode jobs with exact progress args and handles progress, stderr, completion, and cleanup", async () => {
    const root = await tempRoot();
    const videos = new InMemoryVideoRepository();
    const jobs = new InMemoryJobRepository();
    const runner = new FakeProcessRunner();
    const registry = new InMemoryProcessRegistry();
    const persistence = new FakePersistence();
    const scheduler = new InMemoryJobScheduler(10);
    const lifecycle = new JobLifecycleService();
    const cleanup = new CleanupService(
      videos,
      jobs,
      registry,
      persistence,
      {
        uploadDir: path.join(root, "uploads"),
        outputDir: path.join(root, "outputs"),
        tmpDir: path.join(root, "tmp")
      },
      scheduler
    );
    const service = new JobExecutionService(
      runner,
      registry,
      videos,
      jobs,
      persistence,
      cleanup,
      lifecycle,
      processPolicy
    );
    const source = video(root);
    const output = job(root, { status: "queued", progress: 0, kind: "sample" });
    videos.set(source);
    jobs.set(output);
    await writeFile(output.outputPath!, "encoded");

    service.runEncode(output, source.storedPath, 5);
    expect(runner.calls[0].command).toBe("ffmpeg");
    expect(runner.calls[0].args.slice(0, 3)).toEqual(["-progress", "pipe:1", "-nostats"]);
    expect(runner.calls[0].args).toContain(source.storedPath);
    expect(registry.get(output.id)).toBe(runner.latest());
    expect(output.message).toBe("Encoding started");

    runner.latest().emitStdout("out_time_ms=9000000");
    expect(output.progress).toBe(99);
    runner.latest().emitStderr("first line\nlast line that matters");
    expect(output.message).toBe("last line that matters");
    runner.latest().emitClose(0);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(output.status).toBe("completed");
    expect(output.outputSize).toBe(7);
    expect(output.sampleEstimate?.sampleSeconds).toBe(5);
    expect(registry.get(output.id)).toBeUndefined();
  });

  it("fails timed-out encode jobs, removes partial output, ignores late events, and releases registry entries", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const root = await tempRoot();
      const videos = new InMemoryVideoRepository();
      const jobs = new InMemoryJobRepository();
      const runner = new FakeProcessRunner();
      const registry = new InMemoryProcessRegistry();
      const persistence = new FakePersistence();
      const scheduler = new InMemoryJobScheduler(10);
      const lifecycle = new JobLifecycleService();
      const cleanup = new CleanupService(
        videos,
        jobs,
        registry,
        persistence,
        {
          uploadDir: path.join(root, "uploads"),
          outputDir: path.join(root, "outputs"),
          tmpDir: path.join(root, "tmp")
        },
        scheduler
      );
      const timeoutPolicy = { ...processPolicy, timeoutMs: 100, terminationGracePeriodMs: 25 };
      const service = new JobExecutionService(
        runner,
        registry,
        videos,
        jobs,
        persistence,
        cleanup,
        lifecycle,
        timeoutPolicy
      );
      const source = video(root);
      const output = job(root, {
        id: "timeout",
        status: "queued",
        progress: 0,
        outputPath: path.join(root, "outputs", "partial.mp4")
      });
      videos.set(source);
      jobs.set(output);
      await writeFile(output.outputPath!, "partial");

      const promise = service.runEncode(output, source.storedPath);
      await vi.advanceTimersByTimeAsync(100);
      expect(runner.latest().killSignals).toEqual(["SIGTERM"]);
      await vi.advanceTimersByTimeAsync(50);
      await flushPromises();
      await promise;

      expect(output).toMatchObject({
        status: "failed",
        message: "Media processing timed out after 100 ms",
        progress: 0,
        completedAt: expect.any(String)
      });
      await expect(readFile(output.outputPath!)).rejects.toThrow();
      expect(registry.get(output.id)).toBeUndefined();
      expect(warn).toHaveBeenCalledWith("Force-settled timed-out media process for job timeout");

      runner.latest().emitClose(0);
      runner.latest().emitError(new Error("late"));
      expect(output.message).toBe("Media processing timed out after 100 ms");
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it("handles encode spawn errors, nonzero exits, canceled close, poster args, and mux args", async () => {
    const root = await tempRoot();
    const videos = new InMemoryVideoRepository();
    const jobs = new InMemoryJobRepository();
    const runner = new FakeProcessRunner();
    const registry = new InMemoryProcessRegistry();
    const persistence = new FakePersistence();
    const scheduler = new InMemoryJobScheduler(10);
    const lifecycle = new JobLifecycleService();
    const cleanup = new CleanupService(
      videos,
      jobs,
      registry,
      persistence,
      {
        uploadDir: path.join(root, "uploads"),
        outputDir: path.join(root, "outputs"),
        tmpDir: path.join(root, "tmp")
      },
      scheduler
    );
    const service = new JobExecutionService(
      runner,
      registry,
      videos,
      jobs,
      persistence,
      cleanup,
      lifecycle,
      processPolicy
    );
    const source = video(root);
    videos.set(source);

    const failed = job(root, { id: "failed", status: "queued" });
    const failedPromise = service.runEncode(failed, source.storedPath);
    runner.latest().emitError(new Error("spawn nope"));
    await failedPromise;
    expect(failed).toMatchObject({ status: "failed", message: "spawn nope" });

    const nonzero = job(root, {
      id: "nonzero",
      status: "queued",
      outputPath: path.join(root, "outputs", "nonzero-output.mp4")
    });
    await writeFile(nonzero.outputPath!, "remove me");
    service.runEncode(nonzero, source.storedPath);
    runner.latest().emitClose(2);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(nonzero.message).toBe("FFmpeg exited with code 2");
    await expect(readFile(nonzero.outputPath!)).rejects.toThrow();

    const canceled = job(root, { id: "canceled", status: "queued" });
    service.runEncode(canceled, source.storedPath);
    canceled.status = "canceled";
    runner.latest().emitClose(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(canceled).toMatchObject({ progress: 0, message: "Canceled" });

    const poster = job(root, {
      id: "poster",
      kind: "poster",
      status: "queued",
      progress: 0,
      outputPath: path.join(root, "outputs", "poster.webp")
    });
    service.runPoster(poster, source.storedPath, 1.5);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-y",
      "-ss",
      "1.5",
      "-i",
      source.storedPath,
      "-frames:v",
      "1",
      "-c:v",
      "libwebp",
      "-quality",
      "82",
      poster.outputPath
    ]);

    const muxArgs = buildMuxSubtitleArgs("input.mp4", "captions.vtt", "output.mp4", "mp4");
    expect(muxArgs).toEqual([
      "-y",
      "-i",
      "input.mp4",
      "-i",
      "captions.vtt",
      "-map",
      "0",
      "-map",
      "1:0",
      "-c",
      "copy",
      "-c:s",
      "mov_text",
      "-metadata:s:s:0",
      "language=eng",
      "-disposition:s:0",
      "default",
      "-movflags",
      "+faststart",
      "output.mp4"
    ]);
  });
});

describe("CaptionService", () => {
  it("validates subtitle requests, creates jobs, detects silence, and handles missing Whisper configuration", async () => {
    const root = await tempRoot();
    const videos = new InMemoryVideoRepository();
    const jobs = new InMemoryJobRepository();
    const runner = new FakeProcessRunner();
    const registry = new InMemoryProcessRegistry();
    const persistence = new FakePersistence();
    const scheduler = new InMemoryJobScheduler(10);
    const lifecycle = new JobLifecycleService();
    const cleanup = new CleanupService(
      videos,
      jobs,
      registry,
      persistence,
      {
        uploadDir: path.join(root, "uploads"),
        outputDir: path.join(root, "outputs"),
        tmpDir: path.join(root, "tmp")
      },
      scheduler
    );
    const execution = new FakeExecution();
    const jobService = new JobService(
      videos,
      jobs,
      path.join(root, "outputs"),
      persistence,
      cleanup,
      execution,
      new FakeRevealer(),
      scheduler,
      lifecycle
    );
    const service = new CaptionService(
      videos,
      jobs,
      runner,
      registry,
      whisper(undefined),
      persistence,
      cleanup,
      execution,
      jobService,
      path.join(root, "outputs"),
      path.join(root, "tmp"),
      undefined,
      scheduler,
      lifecycle,
      processPolicy
    );

    expect(service.createSubtitleJob("missing")).toEqual({ status: 404, error: "Video not found" });
    videos.set(
      video(root, {
        id: "silent",
        metadata: { ...video(root).metadata, trackCounts: { video: 1, audio: 0, subtitle: 0 } }
      })
    );
    expect(service.createSubtitleJob("silent")).toEqual({
      status: 400,
      error: "No audio track found. Subtitles cannot be generated."
    });

    const source = video(root);
    videos.set(source);
    const result = service.createSubtitleJob(source.id);
    expect(result.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(jobs.get(result.job!.id)).toMatchObject({
      kind: "subtitle",
      outputFileName: "source-file-captions.vtt",
      sidecarFileName: "source-file-captions.srt",
      status: "failed",
      message: "whisper.cpp executable was not found. Set WHISPER_CPP_BIN or add whisper-cli to PATH."
    });

    const silencePromise = service.detectLeadingSilence(source.storedPath, "silence-job");
    expect(registry.get("silence-job")).toBeDefined();
    runner.latest().emitStderr("silence_start: 0\nsilence_end: 4.1234");
    runner.latest().emitClose(0);
    await expect(silencePromise).resolves.toBe(4.123);
    expect(registry.get("silence-job")).toBeUndefined();
  });

  it("updates captions, generates missing SRT, and validates mux creation", async () => {
    const root = await tempRoot();
    const videos = new InMemoryVideoRepository();
    const jobs = new InMemoryJobRepository();
    const runner = new FakeProcessRunner();
    const registry = new InMemoryProcessRegistry();
    const persistence = new FakePersistence();
    const scheduler = new InMemoryJobScheduler(10);
    const lifecycle = new JobLifecycleService();
    const cleanup = new CleanupService(
      videos,
      jobs,
      registry,
      persistence,
      {
        uploadDir: path.join(root, "uploads"),
        outputDir: path.join(root, "outputs"),
        tmpDir: path.join(root, "tmp")
      },
      scheduler
    );
    const execution = new FakeExecution();
    const jobService = new JobService(
      videos,
      jobs,
      path.join(root, "outputs"),
      persistence,
      cleanup,
      execution,
      new FakeRevealer(),
      scheduler,
      lifecycle
    );
    const service = new CaptionService(
      videos,
      jobs,
      runner,
      registry,
      whisper("whisper-cli"),
      persistence,
      cleanup,
      execution,
      jobService,
      path.join(root, "outputs"),
      path.join(root, "tmp"),
      "model.bin",
      scheduler,
      lifecycle,
      processPolicy
    );
    const source = video(root);
    videos.set(source);
    const captions = job(root, {
      id: "captions",
      kind: "subtitle",
      outputPath: path.join(root, "outputs", "captions.vtt"),
      outputFileName: "captions.vtt",
      sidecarPath: path.join(root, "outputs", "captions.srt"),
      sidecarFileName: "captions.srt"
    });
    jobs.set(captions);
    await writeFile(captions.outputPath!, "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello");

    await expect(service.getCaptions(captions.id)).resolves.toMatchObject({ vtt: expect.stringContaining("Hello") });
    await expect(service.updateCaptions(captions.id, "00:00:00.000 --> 00:00:01.000\nUpdated")).resolves.toMatchObject({
      message: "Captions edited"
    });
    await expect(readFile(captions.outputPath!, "utf8")).resolves.toMatch(/^WEBVTT/);
    await expect(service.updateCaptions(captions.id, "not captions")).rejects.toThrow();

    expect(service.createMuxSubtitleJob("missing", captions.id)).toEqual({
      status: 404,
      error: "Completed video output not found"
    });
    const videoJob = job(root, { id: "video-output" });
    jobs.set(videoJob);
    const mux = service.createMuxSubtitleJob(videoJob.id, captions.id);
    expect(mux.status).toBe(202);
    expect(execution.muxCalls).toHaveLength(1);
  });
});

describe("PackageService", () => {
  it("builds a web package ZIP with selected video, poster, captions, transcript, and completed job DTO", async () => {
    const root = await tempRoot();
    const { videos, jobs, service: jobService, persistence } = makeJobService(root);
    const packageService = new PackageService(videos, jobs, path.join(root, "outputs"), persistence, jobService);
    const source = video(root);
    videos.set(source);
    const encode = job(root, { id: "encode", outputFileName: "optimized.mp4" });
    const poster = job(root, {
      id: "poster",
      kind: "poster",
      outputPath: path.join(root, "outputs", "poster.webp"),
      outputFileName: "poster.webp"
    });
    const captions = job(root, {
      id: "captions",
      kind: "subtitle",
      outputPath: path.join(root, "outputs", "captions.vtt"),
      outputFileName: "captions.vtt",
      sidecarPath: path.join(root, "outputs", "captions.srt"),
      sidecarFileName: "captions.srt"
    });
    jobs.set(encode);
    jobs.set(poster);
    jobs.set(captions);
    await writeFile(encode.outputPath!, "video");
    await writeFile(poster.outputPath!, "poster");
    await writeFile(captions.outputPath!, "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n[BLANK_AUDIO]");
    await writeFile(captions.sidecarPath!, "1\n00:00:00,000 --> 00:00:01,000\nHello");

    const result = await packageService.createPackageJob(source.id, {
      metadata: { title: "Demo Video", filenamePrefix: "demo" }
    });

    expect(result.status).toBe(201);
    expect(result.job).toMatchObject<JobDto>({
      id: expect.any(String),
      videoId: source.id,
      kind: "package",
      status: "completed",
      progress: 100,
      outputFileName: "demo-web-package.zip",
      message: "Web package created",
      ffmpegCommand: "Generated package from completed outputs",
      startedAt: expect.any(String),
      completedAt: expect.any(String),
      settings: expect.any(Object)
    });
    const zip = await readFile(jobs.get(result.job!.id)!.outputPath!);
    expect(zipEntryNames(zip)).toEqual([
      "optimized.mp4",
      "poster.webp",
      "captions.vtt",
      "captions.srt",
      "demo-transcript.txt",
      "embed.html",
      "README.txt"
    ]);
    expect(persistence.saves).toBeGreaterThan(0);
  });

  it("returns existing package validation errors", async () => {
    const root = await tempRoot();
    const { videos, jobs, service: jobService, persistence } = makeJobService(root);
    const packageService = new PackageService(videos, jobs, path.join(root, "outputs"), persistence, jobService);
    await expect(packageService.createPackageJob("missing", {})).resolves.toEqual({
      status: 404,
      error: "Video not found"
    });
    const source = video(root);
    videos.set(source);
    jobs.set(job(root, { id: "poster", kind: "poster" }));
    await expect(packageService.createPackageJob(source.id, { jobIds: ["poster"] })).resolves.toEqual({
      status: 400,
      error: "Create at least one completed video export before packaging."
    });
  });
});
