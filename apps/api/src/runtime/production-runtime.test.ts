import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiConfig } from "../config.js";
import type { JobEntity } from "../entities/job-entity.js";
import type { ManifestSnapshot } from "../entities/manifest.js";
import type { VideoEntity } from "../entities/video-entity.js";
import type { ManifestStore } from "../persistence/manifest-store.js";
import { InMemoryJobRepository } from "../repositories/in-memory-job-repository.js";
import { InMemoryVideoRepository } from "../repositories/in-memory-video-repository.js";
import { createProductionRuntime } from "./production-runtime.js";

const tempDirs: string[] = [];

class FakeManifestStore implements ManifestStore {
  public saved?: ManifestSnapshot;

  constructor(private readonly snapshot?: ManifestSnapshot) {}

  async load(): Promise<ManifestSnapshot | undefined> {
    return this.snapshot;
  }

  async save(snapshot: ManifestSnapshot): Promise<void> {
    this.saved = snapshot;
  }
}

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "web-video-runtime-"));
  tempDirs.push(dir);
  return dir;
}

function config(storageRoot: string): ApiConfig {
  return {
    host: "127.0.0.1",
    port: 4000,
    corsOrigin: true,
    storageRoot,
    uploadDir: path.join(storageRoot, "uploads"),
    outputDir: path.join(storageRoot, "outputs"),
    tmpDir: path.join(storageRoot, "tmp"),
    manifestPath: path.join(storageRoot, "manifest.json"),
    uploadFileSizeLimitBytes: 1234,
    maxConcurrentMediaJobs: 1,
    ytDlpJsRuntime: "node:test"
  };
}

function video(storageRoot: string, overrides: Partial<VideoEntity> = {}): VideoEntity {
  return {
    id: "video-1",
    originalName: "source.mp4",
    storedPath: path.join(storageRoot, "uploads", "video-1.mp4"),
    uploadedAt: "2026-07-13T12:00:00.000Z",
    sourceHash: "hash-1",
    metadata: {
      fileName: "source.mp4",
      fileSize: 1234,
      durationSeconds: 12,
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      trackCounts: { video: 1, audio: 1, subtitle: 0 },
      width: 1280,
      height: 720,
      frameRate: 24,
      pixelFormat: "yuv420p",
      webFriendly: true,
      warnings: []
    },
    ...overrides
  };
}

function job(storageRoot: string, overrides: Partial<JobEntity> = {}): JobEntity {
  return {
    id: "job-1",
    videoId: "video-1",
    status: "completed",
    kind: "encode",
    progress: 100,
    outputPath: path.join(storageRoot, "outputs", "job-1-output.mp4"),
    outputFileName: "output.mp4",
    ffmpegCommand: "ffmpeg",
    startedAt: "2026-07-13T12:01:00.000Z",
    settings: {
      outputContainer: "mp4",
      videoCodec: "libx264",
      audioCodec: "aac",
      crf: 26,
      preset: "slow",
      audioMode: "compress",
      audioBitrateKbps: 128,
      fastStart: true,
      stripMetadata: true,
      outputFilename: "output"
    },
    ...overrides
  };
}

async function writeEntityFiles(record: VideoEntity, output?: JobEntity): Promise<void> {
  await mkdir(path.dirname(record.storedPath), { recursive: true });
  await writeFile(record.storedPath, "video");
  if (output?.outputPath) {
    await mkdir(path.dirname(output.outputPath), { recursive: true });
    await writeFile(output.outputPath, "output");
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("createProductionRuntime state isolation", () => {
  it("keeps default runtime instances isolated by storage root", async () => {
    const firstRoot = await tempRoot();
    const secondRoot = await tempRoot();
    const firstVideo = video(firstRoot);
    const secondVideo = video(secondRoot, {
      id: "video-2",
      originalName: "second.mp4",
      storedPath: path.join(secondRoot, "uploads", "video-2.mp4")
    });
    await writeEntityFiles(firstVideo);
    await writeEntityFiles(secondVideo);
    await writeFile(path.join(firstRoot, "manifest.json"), JSON.stringify({ videos: [firstVideo], jobs: [] }, null, 2));
    await writeFile(
      path.join(secondRoot, "manifest.json"),
      JSON.stringify({ videos: [secondVideo], jobs: [] }, null, 2)
    );

    const first = createProductionRuntime(config(firstRoot));
    const second = createProductionRuntime(config(secondRoot));

    await first.initialize();
    await second.initialize();

    expect(first.getVideo("video-1")?.originalName).toBe("source.mp4");
    expect(first.getVideo("video-2")).toBeUndefined();
    expect(second.getVideo("video-2")?.originalName).toBe("second.mp4");
    expect(second.getVideo("video-1")).toBeUndefined();
  });

  it("does not share videos between runtimes with separate repositories", async () => {
    const firstRoot = await tempRoot();
    const secondRoot = await tempRoot();
    const firstVideo = video(firstRoot);
    await writeEntityFiles(firstVideo);

    const first = createProductionRuntime(config(firstRoot), {
      videoRepository: new InMemoryVideoRepository(),
      jobRepository: new InMemoryJobRepository(),
      manifestStore: new FakeManifestStore({ videos: [firstVideo], jobs: [] })
    });
    const second = createProductionRuntime(config(secondRoot), {
      videoRepository: new InMemoryVideoRepository(),
      jobRepository: new InMemoryJobRepository(),
      manifestStore: new FakeManifestStore({ videos: [], jobs: [] })
    });

    await first.initialize();
    await second.initialize();

    expect(first.getVideo("video-1")?.originalName).toBe("source.mp4");
    expect(second.getVideo("video-1")).toBeUndefined();
  });

  it("does not share jobs between runtimes with separate repositories", async () => {
    const firstRoot = await tempRoot();
    const secondRoot = await tempRoot();
    const firstVideo = video(firstRoot);
    const firstJob = job(firstRoot);
    await writeEntityFiles(firstVideo, firstJob);

    const first = createProductionRuntime(config(firstRoot), {
      manifestStore: new FakeManifestStore({ videos: [firstVideo], jobs: [firstJob] })
    });
    const second = createProductionRuntime(config(secondRoot), {
      manifestStore: new FakeManifestStore({ videos: [], jobs: [] })
    });

    await first.initialize();
    await second.initialize();

    expect(first.getJob("job-1")?.outputFileName).toBe("output.mp4");
    expect(second.getJob("job-1")).toBeUndefined();
  });

  it("keeps runtime directory configuration isolated", async () => {
    const firstRoot = await tempRoot();
    const secondRoot = await tempRoot();
    const firstVideo = video(firstRoot);
    const secondVideo = video(secondRoot, {
      id: "video-2",
      originalName: "second.mp4",
      storedPath: path.join(secondRoot, "uploads", "video-2.mp4")
    });
    await writeEntityFiles(firstVideo);
    await writeEntityFiles(secondVideo);

    const first = createProductionRuntime(config(firstRoot), {
      manifestStore: new FakeManifestStore({ videos: [firstVideo], jobs: [] })
    });
    const second = createProductionRuntime(config(secondRoot), {
      manifestStore: new FakeManifestStore({ videos: [secondVideo], jobs: [] })
    });

    await first.initialize();
    await second.initialize();

    expect(first.getVideoSource("video-1")?.filePath).toBe(firstVideo.storedPath);
    expect(second.getVideoSource("video-2")?.filePath).toBe(secondVideo.storedPath);
  });

  it("initializing one runtime does not clear another runtime's repositories", async () => {
    const firstRoot = await tempRoot();
    const secondRoot = await tempRoot();
    const secondRepository = new InMemoryVideoRepository();
    secondRepository.set(video(secondRoot));

    const first = createProductionRuntime(config(firstRoot), {
      manifestStore: new FakeManifestStore({ videos: [], jobs: [] })
    });

    await first.initialize();

    expect(secondRepository.get("video-1")).toBeDefined();
  });

  it("shares repository state only when the caller injects the same repository", async () => {
    const firstRoot = await tempRoot();
    const secondRoot = await tempRoot();
    const sharedRepository = new InMemoryVideoRepository();
    const sharedVideo = video(firstRoot);
    sharedRepository.set(sharedVideo);

    const first = createProductionRuntime(config(firstRoot), {
      videoRepository: sharedRepository,
      manifestStore: new FakeManifestStore({ videos: [], jobs: [] })
    });
    const second = createProductionRuntime(config(secondRoot), {
      videoRepository: sharedRepository,
      manifestStore: new FakeManifestStore({ videos: [], jobs: [] })
    });

    expect(first.getVideo("video-1")?.originalName).toBe(sharedVideo.originalName);
    expect(second.getVideo("video-1")?.originalName).toBe(sharedVideo.originalName);
  });

  it("restores a manifest only into the connected runtime", async () => {
    const firstRoot = await tempRoot();
    const secondRoot = await tempRoot();
    const firstVideo = video(firstRoot);
    await writeEntityFiles(firstVideo);
    const firstStore = new FakeManifestStore({ videos: [firstVideo], jobs: [] });
    const secondStore = new FakeManifestStore({ videos: [], jobs: [] });

    const first = createProductionRuntime(config(firstRoot), { manifestStore: firstStore });
    const second = createProductionRuntime(config(secondRoot), { manifestStore: secondStore });

    await first.initialize();
    await second.initialize();

    expect(firstStore.saved?.videos).toHaveLength(1);
    expect(secondStore.saved?.videos).toHaveLength(0);
  });

  it("keeps private entity fields out of public DTOs", async () => {
    const root = await tempRoot();
    const record = video(root);
    const output = job(root);
    await writeEntityFiles(record, output);

    const runtime = createProductionRuntime(config(root), {
      manifestStore: new FakeManifestStore({ videos: [record], jobs: [output] })
    });

    await runtime.initialize();

    const publicJson = JSON.stringify(runtime.getHistory());
    expect(publicJson).not.toContain("storedPath");
    expect(publicJson).not.toContain("sourceHash");
    expect(publicJson).not.toContain("outputPath");
    expect(publicJson).not.toContain("sidecarPath");
  });

  it("preserves restart manifest-save policy", async () => {
    const root = await tempRoot();
    const record = video(root);
    const videoRepository = new InMemoryVideoRepository();
    const jobRepository = new InMemoryJobRepository();
    const manifestStore = new FakeManifestStore();
    videoRepository.set(record);
    jobRepository.set(job(root, { id: "completed-job", status: "completed", message: "Done" }));
    jobRepository.set(job(root, { id: "canceled-job", status: "canceled", message: "Canceled" }));
    jobRepository.set(job(root, { id: "running-job", status: "running", message: "Encoding" }));
    jobRepository.set(job(root, { id: "queued-job", status: "queued", message: "Waiting" }));
    const runtime = createProductionRuntime(config(root), { videoRepository, jobRepository, manifestStore });

    await runtime.renameVideo(record.id, "renamed.mp4");

    expect(manifestStore.saved?.videos).toEqual([
      expect.objectContaining({
        id: record.id,
        storedPath: record.storedPath,
        sourceHash: record.sourceHash
      })
    ]);
    expect(manifestStore.saved?.jobs.map((savedJob) => savedJob.id)).toEqual([
      "completed-job",
      "running-job",
      "queued-job"
    ]);
    expect(manifestStore.saved?.jobs.find((savedJob) => savedJob.id === "completed-job")).toMatchObject({
      status: "completed",
      outputPath: path.join(root, "outputs", "job-1-output.mp4")
    });
    expect(manifestStore.saved?.jobs.find((savedJob) => savedJob.id === "running-job")).toMatchObject({
      status: "canceled",
      message: "Canceled by API restart"
    });
    expect(manifestStore.saved?.jobs.find((savedJob) => savedJob.id === "queued-job")).toMatchObject({
      status: "canceled",
      message: "Canceled by API restart"
    });
  });
});
