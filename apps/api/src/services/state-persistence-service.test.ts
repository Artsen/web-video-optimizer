import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeOptimizationSettings } from "@local-video-optimizer/video-core";
import type { JobEntity } from "../entities/job-entity.js";
import type { ManifestSnapshot } from "../entities/manifest.js";
import type { VideoEntity } from "../entities/video-entity.js";
import type { ManifestLoadResult, ManifestStore } from "../persistence/manifest-store.js";
import { InMemoryJobRepository } from "../repositories/in-memory-job-repository.js";
import { InMemoryVideoRepository } from "../repositories/in-memory-video-repository.js";
import { ManifestStatePersistenceService } from "./state-persistence-service.js";

const tempDirs: string[] = [];

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

class DeferredManifestStore implements ManifestStore {
  readonly saves: ManifestSnapshot[] = [];
  readonly activeCounts: number[] = [];
  readonly pending: Array<ReturnType<typeof deferred<void>>> = [];
  active = 0;
  loadResult: ManifestLoadResult = { kind: "missing" };

  async load(): Promise<ManifestLoadResult> {
    return this.loadResult;
  }

  async save(snapshot: ManifestSnapshot): Promise<void> {
    this.active += 1;
    this.activeCounts.push(this.active);
    this.saves.push(structuredClone(snapshot));
    const pending = deferred<void>();
    this.pending.push(pending);
    try {
      await pending.promise;
    } finally {
      this.active -= 1;
    }
  }
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-video-state-"));
  tempDirs.push(root);
  await mkdir(path.join(root, "uploads"), { recursive: true });
  await mkdir(path.join(root, "outputs"), { recursive: true });
  await mkdir(path.join(root, "tmp"), { recursive: true });
  return root;
}

function video(root: string, overrides: Partial<VideoEntity> = {}): VideoEntity {
  return {
    id: "video-1",
    originalName: "source.mp4",
    storedPath: path.join(root, "uploads", "video-1.mp4"),
    uploadedAt: "2026-07-13T12:00:00.000Z",
    sourceHash: "hash",
    metadata: {
      fileName: "source.mp4",
      fileSize: 4,
      durationSeconds: 1,
      container: "mp4",
      trackCounts: { video: 1, audio: 1, subtitle: 0 },
      webFriendly: true,
      warnings: []
    },
    ...overrides
  };
}

function job(root: string, overrides: Partial<JobEntity> = {}): JobEntity {
  return {
    id: "job-1",
    videoId: "video-1",
    status: "completed",
    kind: "encode",
    progress: 100,
    outputPath: path.join(root, "outputs", "job-1.mp4"),
    outputFileName: "job-1.mp4",
    ffmpegCommand: "ffmpeg",
    startedAt: "2026-07-13T12:01:00.000Z",
    settings: normalizeOptimizationSettings({ outputFilename: "job-1" }),
    ...overrides
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ManifestStatePersistenceService", () => {
  it("serializes save requests and flush waits for the latest requested state", async () => {
    const root = await tempRoot();
    const videos = new InMemoryVideoRepository();
    const jobs = new InMemoryJobRepository();
    const store = new DeferredManifestStore();
    const service = new ManifestStatePersistenceService(videos, jobs, store);
    videos.set(video(root));

    const first = service.save();
    jobs.set(job(root, { id: "latest" }));
    const second = service.save();
    const flushed = service.flush();
    await flushMicrotasks();

    expect(store.activeCounts).toEqual([1]);
    store.pending[0].resolve();
    await first;
    await flushMicrotasks();
    expect(store.activeCounts).toEqual([1, 1]);
    expect(store.saves[1].jobs.map((savedJob) => savedJob.id)).toEqual(["latest"]);
    store.pending[1].resolve();

    await second;
    await flushed;
    expect(store.active).toBe(0);
  });

  it("surfaces failed saves, avoids poisoning later saves, and scheduleSave handles rejection", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = await tempRoot();
    const videos = new InMemoryVideoRepository();
    const jobs = new InMemoryJobRepository();
    const store = new DeferredManifestStore();
    const service = new ManifestStatePersistenceService(videos, jobs, store);
    videos.set(video(root));
    jobs.set(job(root));

    const failed = service.save();
    await flushMicrotasks();
    store.pending[0].reject(new Error("disk full"));
    await expect(failed).rejects.toThrow("disk full");

    const later = service.save();
    await flushMicrotasks();
    store.pending[1].resolve();
    await expect(later).resolves.toBeUndefined();

    service.scheduleSave();
    await flushMicrotasks();
    store.pending[2].reject(new Error("logged"));
    await expect(service.flush()).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith("Unable to persist application state:", expect.any(Error));
  });

  it("normalizes interrupted jobs on load and removes partial artifacts", async () => {
    const root = await tempRoot();
    const source = video(root, { sourceHash: undefined });
    const running = job(root, { id: "running", status: "running", progress: 44 });
    const queued = job(root, { id: "queued", status: "queued", outputPath: path.join(root, "outputs", "queued.mp4") });
    const missingOutput = job(root, { id: "missing-output", outputPath: path.join(root, "outputs", "missing.mp4") });
    const dangling = job(root, { id: "dangling", videoId: "missing-video" });
    await writeFile(source.storedPath, "data");
    await writeFile(running.outputPath!, "partial");
    await writeFile(queued.outputPath!, "partial");

    const store = new DeferredManifestStore();
    store.loadResult = {
      kind: "loaded",
      source: "primary",
      recoveredFromBackup: false,
      snapshot: {
        videos: [source],
        jobs: [running, queued, missingOutput, dangling]
      }
    };
    const videos = new InMemoryVideoRepository();
    const jobs = new InMemoryJobRepository();
    const service = new ManifestStatePersistenceService(videos, jobs, store, { tmpDir: path.join(root, "tmp") });

    const report = await service.load();

    expect(report).toMatchObject({
      restoredVideos: 1,
      restoredJobs: 3,
      canceledInterruptedJobs: 2,
      failedMissingOutputJobs: 1,
      skippedDanglingJobs: 1
    });
    expect(videos.get(source.id)?.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(jobs.get("running")).toMatchObject({ status: "canceled", progress: 0, message: "Canceled by API restart" });
    expect(jobs.get("queued")).toMatchObject({ status: "canceled", progress: 0, message: "Canceled by API restart" });
    expect(jobs.get("missing-output")).toMatchObject({
      status: "failed",
      message: "Output missing during API restart recovery"
    });
    expect(jobs.get("dangling")).toBeUndefined();
    await expect(writeFile(running.outputPath!, "can-create-again")).resolves.toBeUndefined();
  });
});
