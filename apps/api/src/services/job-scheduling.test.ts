import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OptimizationSettings } from "@local-video-optimizer/contracts";
import { normalizeOptimizationSettings } from "@local-video-optimizer/video-core";
import type { JobEntity } from "../entities/job-entity.js";
import type { VideoEntity } from "../entities/video-entity.js";
import type { FileRevealer } from "../infrastructure/desktop/file-revealer.js";
import { InMemoryProcessRegistry } from "../infrastructure/processes/in-memory-process-registry.js";
import { FakeProcessRunner } from "../infrastructure/processes/test/fake-process-runner.js";
import type { WhisperAdapter } from "../infrastructure/tools/whisper-adapter.js";
import { InMemoryJobRepository } from "../repositories/in-memory-job-repository.js";
import { InMemoryVideoRepository } from "../repositories/in-memory-video-repository.js";
import { InMemoryJobScheduler } from "../scheduling/in-memory-job-scheduler.js";
import { CaptionService } from "./caption-service.js";
import { CleanupService } from "./cleanup-service.js";
import { JobExecutionService, type JobExecutor } from "./job-execution-service.js";
import { JobLifecycleService } from "./job-lifecycle-service.js";
import { JobService } from "./job-service.js";
import { PackageService } from "./package-service.js";
import type { RecoveryReport, StatePersistenceService } from "./state-persistence-service.js";

const tempDirs: string[] = [];

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

class FakeRevealer implements FileRevealer {
  async reveal(): Promise<void> {}
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

class DeferredExecution implements JobExecutor {
  readonly encodeCalls: Array<{ job: JobEntity; inputPath: string; durationLimitSeconds?: number }> = [];
  readonly posterCalls: Array<{ job: JobEntity; inputPath: string; atSeconds: number }> = [];
  readonly muxCalls: Array<{ job: JobEntity; videoJob: JobEntity; subtitleJob: JobEntity }> = [];
  readonly deferred = new Map<string, ReturnType<typeof deferred>>();

  runEncode(job: JobEntity, inputPath: string, durationLimitSeconds?: number): Promise<void> {
    this.encodeCalls.push({ job, inputPath, durationLimitSeconds });
    const task = deferred();
    this.deferred.set(job.id, task);
    return task.promise;
  }

  runPoster(job: JobEntity, inputPath: string, atSeconds: number): Promise<void> {
    this.posterCalls.push({ job, inputPath, atSeconds });
    const task = deferred();
    this.deferred.set(job.id, task);
    return task.promise;
  }

  runMux(job: JobEntity, videoJob: JobEntity, subtitleJob: JobEntity): Promise<void> {
    this.muxCalls.push({ job, videoJob, subtitleJob });
    const task = deferred();
    this.deferred.set(job.id, task);
    return task.promise;
  }

  complete(jobId: string): void {
    this.deferred.get(jobId)?.resolve();
  }
}

function whisper(command = "whisper-cli", model = true): WhisperAdapter {
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

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function settleProcesses(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "web-video-scheduling-"));
  tempDirs.push(dir);
  await mkdir(path.join(dir, "uploads"), { recursive: true });
  await mkdir(path.join(dir, "outputs"), { recursive: true });
  await mkdir(path.join(dir, "tmp"), { recursive: true });
  return dir;
}

function video(root: string, overrides: Partial<VideoEntity> = {}): VideoEntity {
  return {
    id: "video-1",
    originalName: "source.mp4",
    storedPath: path.join(root, "uploads", "video-1.mp4"),
    uploadedAt: "2026-07-13T12:00:00.000Z",
    sourceHash: "hash-1",
    metadata: {
      fileName: "source.mp4",
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

function completedJob(root: string, overrides: Partial<JobEntity> = {}): JobEntity {
  return {
    id: "completed-video",
    videoId: "video-1",
    status: "completed",
    kind: "encode",
    progress: 100,
    outputPath: path.join(root, "outputs", "completed-video.mp4"),
    outputFileName: "completed-video.mp4",
    ffmpegCommand: "ffmpeg",
    startedAt: "2026-07-13T12:01:00.000Z",
    settings: settings(),
    ...overrides
  };
}

function makeServices(root: string, concurrency = 1, execution: JobExecutor = new DeferredExecution()) {
  const videos = new InMemoryVideoRepository();
  const jobs = new InMemoryJobRepository();
  const registry = new InMemoryProcessRegistry();
  const persistence = new FakePersistence();
  const scheduler = new InMemoryJobScheduler(concurrency);
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
  return { videos, jobs, registry, persistence, scheduler, lifecycle, cleanup, jobService, execution };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("service media scheduling", () => {
  it("enqueues optimization work and starts queued jobs after capacity is released", async () => {
    const root = await tempRoot();
    const execution = new DeferredExecution();
    const { videos, scheduler, jobService } = makeServices(root, 1, execution);
    const source = video(root);
    videos.set(source);

    const first = jobService.createOptimizationJob(source.id, settings({ outputFilename: "first" })).job!;
    const second = jobService.createOptimizationJob(source.id, settings({ outputFilename: "second" })).job!;

    expect(execution.encodeCalls.map((call) => call.job.id)).toEqual([first.id]);
    expect(scheduler.getSnapshot()).toMatchObject({ queuedJobIds: [second.id], runningJobIds: [first.id] });
    expect(second.status).toBe("queued");

    execution.complete(first.id);
    await flush();

    expect(execution.encodeCalls.map((call) => call.job.id)).toEqual([first.id, second.id]);
    expect(scheduler.getSnapshot()).toMatchObject({ queuedJobIds: [], runningJobIds: [second.id] });
  });

  it("schedules sample, poster, mux, and subtitles while leaving package work outside the media scheduler", async () => {
    const root = await tempRoot();
    const execution = new DeferredExecution();
    const { videos, jobs, scheduler, jobService, cleanup, persistence, registry, lifecycle } = makeServices(
      root,
      1,
      execution
    );
    const source = video(root);
    videos.set(source);

    const sample = jobService.createSampleJob(source.id, settings({ outputFilename: "sample-a" }), 3).job!;
    const poster = jobService.createPosterJob(source.id, 1)!;
    expect(execution.encodeCalls.map((call) => call.job.id)).toEqual([sample.id]);
    expect(execution.posterCalls).toHaveLength(0);
    expect(scheduler.getSnapshot().queuedJobIds).toEqual([poster.id]);

    execution.complete(sample.id);
    await flush();
    expect(execution.posterCalls.map((call) => call.job.id)).toEqual([poster.id]);

    const captionService = new CaptionService(
      videos,
      jobs,
      new FakeProcessRunner(),
      registry,
      whisper(),
      persistence,
      cleanup,
      execution,
      jobService,
      path.join(root, "outputs"),
      path.join(root, "tmp"),
      "model.bin",
      scheduler,
      lifecycle
    );
    const videoOutput = completedJob(root);
    const subtitles = completedJob(root, {
      id: "subtitles",
      kind: "subtitle",
      outputPath: path.join(root, "outputs", "captions.vtt"),
      outputFileName: "captions.vtt"
    });
    jobs.set(videoOutput);
    jobs.set(subtitles);

    const mux = captionService.createMuxSubtitleJob(videoOutput.id, subtitles.id).job!;
    expect(execution.muxCalls).toHaveLength(0);
    expect(scheduler.getSnapshot().queuedJobIds).toEqual([mux.id]);

    execution.complete(poster.id);
    await flush();
    expect(execution.muxCalls.map((call) => call.job.id)).toEqual([mux.id]);

    const packageService = new PackageService(videos, jobs, path.join(root, "outputs"), persistence, jobService);
    await writeFile(videoOutput.outputPath!, "video");
    await expect(packageService.createPackageJob(source.id, { jobIds: [videoOutput.id] })).resolves.toMatchObject({
      status: 201,
      job: { kind: "package", status: "completed" }
    });
    expect(scheduler.getSnapshot().queuedJobIds).toEqual([]);
  });

  it("does not enqueue missing or reusable jobs and pair jobs obey configured concurrency", async () => {
    const root = await tempRoot();
    const executionOne = new DeferredExecution();
    const one = makeServices(root, 1, executionOne);
    const source = video(root);
    one.videos.set(source);

    expect(one.jobService.createOptimizationJob("missing", settings()).job).toBeUndefined();
    expect(one.scheduler.getSnapshot()).toMatchObject({ queuedJobIds: [], runningJobIds: [] });

    const reusable = completedJob(root, { status: "queued" });
    one.jobs.set(reusable);
    expect(one.jobService.createOptimizationJob(source.id, settings()).job?.id).toBe(reusable.id);
    expect(executionOne.encodeCalls).toHaveLength(0);

    one.jobs.delete(reusable.id);
    const pair = one.jobService.createPairJobs(source.id)!;
    expect(executionOne.encodeCalls).toHaveLength(1);
    expect(one.scheduler.getSnapshot()).toMatchObject({
      queuedJobIds: [pair.jobs[1].id],
      runningJobIds: [pair.jobs[0].id]
    });

    const executionTwo = new DeferredExecution();
    const two = makeServices(root, 2, executionTwo);
    two.videos.set(video(root, { id: "video-2" }));
    const pairTwo = two.jobService.createPairJobs("video-2")!;
    expect(executionTwo.encodeCalls.map((call) => call.job.id)).toEqual(pairTwo.jobs.map((job) => job.id));
    expect(two.scheduler.getSnapshot().queuedJobIds).toEqual([]);
  });

  it("cancels queued jobs before they start", async () => {
    const root = await tempRoot();
    const execution = new DeferredExecution();
    const { videos, jobs, scheduler, jobService } = makeServices(root, 1, execution);
    const source = video(root);
    videos.set(source);

    const first = jobService.createOptimizationJob(source.id, settings({ outputFilename: "first" })).job!;
    const second = jobService.createOptimizationJob(source.id, settings({ outputFilename: "second" })).job!;

    await expect(jobService.cancel(second.id)).resolves.toMatchObject({ id: second.id, status: "canceled" });
    expect(jobs.get(second.id)).toBeUndefined();
    expect(scheduler.getSnapshot().queuedJobIds).toEqual([]);

    execution.complete(first.id);
    await flush();
    expect(execution.encodeCalls.map((call) => call.job.id)).toEqual([first.id]);
  });
});

describe("fake process scheduler integration", () => {
  it("runs two encodes with concurrency 1 and starts the second only after the first completes", async () => {
    const root = await tempRoot();
    const runner = new FakeProcessRunner();
    const { videos, jobs, scheduler, registry, persistence, cleanup, lifecycle } = makeServices(root);
    const execution = new JobExecutionService(runner, registry, videos, jobs, persistence, cleanup, lifecycle);
    const service = new JobService(
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
    const source = video(root);
    videos.set(source);

    const first = service.createOptimizationJob(source.id, settings({ outputFilename: "first" })).job!;
    const second = service.createOptimizationJob(source.id, settings({ outputFilename: "second" })).job!;

    expect(runner.calls).toHaveLength(1);
    expect(jobs.get(first.id)?.status).toBe("running");
    expect(jobs.get(second.id)?.status).toBe("queued");
    runner.latest().emitStdout("out_time_ms=5000000");
    expect(jobs.get(first.id)?.progress).toBe(50);

    await writeFile(jobs.get(first.id)!.outputPath!, "first");
    runner.latest().emitClose(0);
    await settleProcesses();

    expect(runner.calls).toHaveLength(2);
    expect(jobs.get(second.id)?.status).toBe("running");
    await writeFile(jobs.get(second.id)!.outputPath!, "second");
    runner.latest().emitClose(0);
    await settleProcesses();

    expect(jobs.get(first.id)?.status).toBe("completed");
    expect(jobs.get(second.id)?.status).toBe("completed");
  });

  it("starts the next queued job after failure, spawn error, and running cancellation settlement", async () => {
    const root = await tempRoot();
    const runner = new FakeProcessRunner();
    const { videos, jobs, scheduler, registry, persistence, cleanup, lifecycle } = makeServices(root);
    const execution = new JobExecutionService(runner, registry, videos, jobs, persistence, cleanup, lifecycle);
    const service = new JobService(
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
    const source = video(root);
    videos.set(source);

    const failed = service.createOptimizationJob(source.id, settings({ outputFilename: "failed" })).job!;
    const afterFailure = service.createOptimizationJob(source.id, settings({ outputFilename: "after-failure" })).job!;
    runner.latest().emitClose(2);
    await settleProcesses();
    expect(jobs.get(failed.id)?.status).toBe("failed");
    expect(jobs.get(afterFailure.id)?.status).toBe("running");

    runner.latest().emitError(new Error("spawn exploded"));
    runner.latest().emitClose(0);
    await settleProcesses();
    expect(jobs.get(afterFailure.id)?.status).toBe("failed");
    expect(jobs.get(afterFailure.id)?.message).toBe("spawn exploded");

    const canceled = service.createOptimizationJob(source.id, settings({ outputFilename: "cancel-running" })).job!;
    const afterCancel = service.createOptimizationJob(source.id, settings({ outputFilename: "after-cancel" })).job!;
    await expect(service.cancel(canceled.id)).resolves.toMatchObject({ status: "canceled" });
    expect(runner.latest().killedWith).toBe("SIGTERM");
    runner.latest().emitError(new Error("late cancellation error"));
    await settleProcesses();
    expect(jobs.get(afterCancel.id)?.status).toBe("running");
  });

  it("keeps subtitle generation in one slot across extraction and Whisper", async () => {
    const root = await tempRoot();
    const runner = new FakeProcessRunner();
    const { videos, jobs, scheduler, registry, persistence, cleanup, lifecycle } = makeServices(root);
    const source = video(root);
    videos.set(source);
    const execution = new JobExecutionService(runner, registry, videos, jobs, persistence, cleanup, lifecycle);
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
    const captionService = new CaptionService(
      videos,
      jobs,
      runner,
      registry,
      whisper(),
      persistence,
      cleanup,
      execution,
      jobService,
      path.join(root, "outputs"),
      path.join(root, "tmp"),
      "model.bin",
      scheduler,
      lifecycle
    );

    const subtitles = captionService.createSubtitleJob(source.id).job!;
    const encode = jobService.createOptimizationJob(
      source.id,
      settings({ outputFilename: "queued-behind-subtitles" })
    ).job!;
    await flush();

    expect(runner.calls).toHaveLength(1);
    expect(jobs.get(subtitles.id)?.message).toBe("Checking leading silence");
    expect(jobs.get(encode.id)?.status).toBe("queued");

    runner.latest().emitClose(0);
    await settleProcesses();
    expect(runner.calls).toHaveLength(2);
    expect(jobs.get(encode.id)?.status).toBe("queued");

    runner.latest().emitClose(0);
    await settleProcesses();
    expect(runner.calls).toHaveLength(3);
    expect(runner.calls[2].command).toBe("whisper-cli");
    expect(jobs.get(encode.id)?.status).toBe("queued");

    await writeFile(jobs.get(subtitles.id)!.outputPath!, "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello");
    runner.latest().emitClose(0);
    await settleProcesses();

    expect(jobs.get(subtitles.id)?.status).toBe("completed");
    expect(jobs.get(encode.id)?.status).toBe("running");
  });

  it("cancels subtitle generation during leading-silence detection before starting later stages", async () => {
    const root = await tempRoot();
    const runner = new FakeProcessRunner();
    const { videos, jobs, scheduler, registry, persistence, cleanup, lifecycle } = makeServices(root);
    const source = video(root);
    videos.set(source);
    const execution = new JobExecutionService(runner, registry, videos, jobs, persistence, cleanup, lifecycle);
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
    const captionService = new CaptionService(
      videos,
      jobs,
      runner,
      registry,
      whisper(),
      persistence,
      cleanup,
      execution,
      jobService,
      path.join(root, "outputs"),
      path.join(root, "tmp"),
      "model.bin",
      scheduler,
      lifecycle
    );

    const subtitles = captionService.createSubtitleJob(source.id).job!;
    const encode = jobService.createOptimizationJob(
      source.id,
      settings({ outputFilename: "after-subtitle-cancel" })
    ).job!;
    await flush();

    expect(runner.calls).toHaveLength(1);
    expect(jobs.get(subtitles.id)?.message).toBe("Checking leading silence");
    expect(jobs.get(encode.id)?.status).toBe("queued");

    await expect(jobService.cancel(subtitles.id)).resolves.toMatchObject({ status: "canceled" });
    expect(runner.latest().killedWith).toBe("SIGTERM");
    expect(jobs.get(subtitles.id)).toBeUndefined();

    runner.latest().emitClose(0);
    await settleProcesses();

    expect(runner.calls).toHaveLength(2);
    expect(runner.calls[1].command).toBe("ffmpeg");
    expect(runner.calls[1].args.slice(0, 2)).toEqual(["-progress", "pipe:1"]);
    expect(jobs.get(encode.id)?.status).toBe("running");
  });
});
