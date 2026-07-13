import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Capabilities } from "@local-video-optimizer/contracts";
import type { FFprobeResult } from "@local-video-optimizer/video-core";
import type { JobEntity } from "../entities/job-entity.js";
import type { ManifestSnapshot } from "../entities/manifest.js";
import type { VideoEntity } from "../entities/video-entity.js";
import { InMemoryProcessRegistry } from "../infrastructure/processes/in-memory-process-registry.js";
import { FakeRunningProcess } from "../infrastructure/processes/test/fake-process-runner.js";
import type { FfmpegCapabilitiesAdapter } from "../infrastructure/tools/ffmpeg-capabilities-adapter.js";
import type { MediaProbe } from "../infrastructure/tools/ffprobe-adapter.js";
import type { WhisperAdapter } from "../infrastructure/tools/whisper-adapter.js";
import type { VideoDownloader } from "../infrastructure/tools/yt-dlp-adapter.js";
import type { ManifestStore } from "../persistence/manifest-store.js";
import { InMemoryJobRepository } from "../repositories/in-memory-job-repository.js";
import { InMemoryVideoRepository } from "../repositories/in-memory-video-repository.js";
import { CapabilitiesService } from "./capabilities-service.js";
import { CleanupService } from "./cleanup-service.js";
import { ManifestStatePersistenceService } from "./state-persistence-service.js";
import { VideoService } from "./video-service.js";

const tempDirs: string[] = [];

class FakeManifestStore implements ManifestStore {
  saved?: ManifestSnapshot;

  constructor(private readonly snapshot?: ManifestSnapshot) {}

  async load(): Promise<ManifestSnapshot | undefined> {
    return this.snapshot;
  }

  async save(snapshot: ManifestSnapshot): Promise<void> {
    this.saved = snapshot;
  }
}

class FakeMediaProbe implements MediaProbe {
  calls: string[] = [];

  async probe(filePath: string): Promise<FFprobeResult> {
    this.calls.push(filePath);
    return {
      format: { duration: "4.5", size: "9", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1280, height: 720, avg_frame_rate: "24/1" },
        { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 }
      ]
    };
  }
}

class FakeVideoDownloader implements VideoDownloader {
  constructor(private readonly importedPath?: string) {}

  async resolveCommand(): Promise<string | undefined> {
    return "yt-dlp";
  }

  jsRuntimeValue(): string {
    return "node:D:/node.exe";
  }

  jsRuntimeArgs(): string[] {
    return ["--js-runtimes", this.jsRuntimeValue()];
  }

  async download(): Promise<string> {
    if (!this.importedPath) throw new Error("No fake download configured");
    return this.importedPath;
  }
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
      fileSize: 9,
      durationSeconds: 4.5,
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

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "web-video-services-"));
  tempDirs.push(dir);
  await mkdir(path.join(dir, "uploads"), { recursive: true });
  await mkdir(path.join(dir, "outputs"), { recursive: true });
  await mkdir(path.join(dir, "tmp"), { recursive: true });
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ManifestStatePersistenceService", () => {
  it("persists queued and running jobs as canceled while excluding already canceled jobs", async () => {
    const videos = new InMemoryVideoRepository();
    const jobs = new InMemoryJobRepository();
    const store = new FakeManifestStore();
    const service = new ManifestStatePersistenceService(videos, jobs, store);
    const root = await tempRoot();
    videos.set(video(root));
    jobs.set(job(root, { id: "queued", status: "queued" }));
    jobs.set(job(root, { id: "running", status: "running" }));
    jobs.set(job(root, { id: "canceled", status: "canceled" }));

    await service.save();

    expect(store.saved?.jobs.map((item) => [item.id, item.status, item.message])).toEqual([
      ["queued", "canceled", "Canceled by API restart"],
      ["running", "canceled", "Canceled by API restart"]
    ]);
  });
});

describe("CleanupService", () => {
  it("kills active processes, deletes artifacts, cascades video jobs, and preserves referenced files", async () => {
    const root = await tempRoot();
    const videos = new InMemoryVideoRepository();
    const jobs = new InMemoryJobRepository();
    const registry = new InMemoryProcessRegistry();
    const store = new FakeManifestStore();
    const persistence = new ManifestStatePersistenceService(videos, jobs, store);
    const cleanup = new CleanupService(videos, jobs, registry, persistence, {
      uploadDir: path.join(root, "uploads"),
      outputDir: path.join(root, "outputs"),
      tmpDir: path.join(root, "tmp")
    });
    const source = video(root);
    const output = job(root, {
      sidecarPath: path.join(root, "outputs", "job-1-output.vtt"),
      sidecarFileName: "output.vtt"
    });
    videos.set(source);
    jobs.set(output);
    await writeFile(source.storedPath, "source");
    await writeFile(output.outputPath!, "output");
    await writeFile(output.sidecarPath!, "sidecar");
    await writeFile(path.join(root, "outputs", "orphan.mp4"), "orphan");
    const process = new FakeRunningProcess();
    registry.set(output.id, process);

    await cleanup.removeVideoRecord(source);
    await cleanup.pruneOrphanFiles();

    expect(process.killedWith).toBe("SIGTERM");
    expect(videos.get(source.id)).toBeUndefined();
    expect(jobs.get(output.id)).toBeUndefined();
    await expect(readFile(source.storedPath)).rejects.toThrow();
    await expect(readFile(output.outputPath!)).rejects.toThrow();
    await expect(readFile(output.sidecarPath!)).rejects.toThrow();
    await expect(readFile(path.join(root, "outputs", "orphan.mp4"))).rejects.toThrow();
  });
});

describe("CapabilitiesService", () => {
  it("combines codec, whisper, and downloader capabilities without caching", async () => {
    let ffmpegCalls = 0;
    const ffmpeg: FfmpegCapabilitiesAdapter = {
      async getCapabilities(): Promise<Pick<Capabilities, "libx264" | "libaomAv1" | "libvpxVp9" | "aac" | "libopus">> {
        ffmpegCalls += 1;
        return { libx264: true, libaomAv1: true, libvpxVp9: false, aac: true, libopus: true };
      }
    };
    const whisper: WhisperAdapter = {
      async resolveCommand() {
        return "whisper-cli";
      },
      modelPath() {
        return "D:/ggml-base.en.bin";
      },
      hasModel() {
        return true;
      }
    };
    const downloader = new FakeVideoDownloader();
    const service = new CapabilitiesService(ffmpeg, whisper, downloader);

    await expect(service.getCapabilities()).resolves.toMatchObject({
      libx264: true,
      libaomAv1: true,
      whisperCpp: true,
      whisperCommand: "whisper-cli",
      whisperModel: true,
      ytDlp: true,
      ytDlpCommand: "yt-dlp",
      ytDlpJsRuntime: "node:D:/node.exe"
    });
    await service.getCapabilities();
    expect(ffmpegCalls).toBe(2);
  });
});

describe("VideoService", () => {
  it("stores uploads, probes metadata, persists state, and removes duplicate temporary uploads", async () => {
    const root = await tempRoot();
    const videos = new InMemoryVideoRepository();
    const jobs = new InMemoryJobRepository();
    const probe = new FakeMediaProbe();
    const store = new FakeManifestStore();
    const persistence = new ManifestStatePersistenceService(videos, jobs, store);
    const cleanup = new CleanupService(videos, jobs, new InMemoryProcessRegistry(), persistence, {
      uploadDir: path.join(root, "uploads"),
      outputDir: path.join(root, "outputs"),
      tmpDir: path.join(root, "tmp")
    });
    const service = new VideoService(
      videos,
      jobs,
      probe,
      new FakeVideoDownloader(),
      cleanup,
      persistence,
      path.join(root, "uploads"),
      path.join(root, "tmp")
    );
    const firstUpload = path.join(root, "tmp", "first name.mov");
    const duplicateUpload = path.join(root, "tmp", "other-name.mp4");
    await writeFile(firstUpload, "same video bytes");
    await writeFile(duplicateUpload, "same video bytes");

    const first = await service.createFromUpload({ path: firstUpload, originalName: "first name.mov" });
    const duplicate = await service.createFromUpload({ path: duplicateUpload, originalName: "other-name.mp4" });

    expect(first.id).toBe(duplicate.id);
    expect(first.originalName).toBe("first name.mov");
    expect(first.metadata.trackCounts).toEqual({ video: 1, audio: 1, subtitle: 0 });
    expect(probe.calls).toHaveLength(1);
    expect(store.saved?.videos).toHaveLength(1);
    await expect(readFile(duplicateUpload)).rejects.toThrow();
  });

  it("renames videos while preserving the stored extension and delegates deletion", async () => {
    const root = await tempRoot();
    const videos = new InMemoryVideoRepository();
    const jobs = new InMemoryJobRepository();
    const store = new FakeManifestStore();
    const persistence = new ManifestStatePersistenceService(videos, jobs, store);
    const cleanup = new CleanupService(videos, jobs, new InMemoryProcessRegistry(), persistence, {
      uploadDir: path.join(root, "uploads"),
      outputDir: path.join(root, "outputs"),
      tmpDir: path.join(root, "tmp")
    });
    const service = new VideoService(
      videos,
      jobs,
      new FakeMediaProbe(),
      new FakeVideoDownloader(),
      cleanup,
      persistence,
      path.join(root, "uploads"),
      path.join(root, "tmp")
    );
    const source = video(root);
    videos.set(source);
    await writeFile(source.storedPath, "source");

    await expect(service.rename(source.id, "Final!.webm")).resolves.toMatchObject({ originalName: "Final.mp4" });
    expect(videos.get(source.id)?.metadata.fileName).toBe("Final.mp4");
    await expect(service.rename(source.id, "!!!.mp4")).rejects.toThrow("Enter a filename with letters or numbers.");
    await expect(service.getDownload(source.id)).toEqual({ filePath: source.storedPath, fileName: "Final.mp4" });
    await expect(service.delete(source.id)).resolves.toBe(true);
    expect(videos.get(source.id)).toBeUndefined();
  });
});
