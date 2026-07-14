import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FFprobeResult, FFprobeStream } from "@local-video-optimizer/video-core";
import type { MediaProbe } from "../infrastructure/tools/ffprobe-adapter.js";
import { InMemoryVideoRepository } from "../repositories/in-memory-video-repository.js";
import type { StatePersistenceService } from "../services/state-persistence-service.js";
import { StorageBoundary } from "../storage/storage-boundary.js";
import { MediaAdmissionService } from "./media-admission-service.js";

const tempDirs: string[] = [];

const mp4Bytes = Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex");

class FakePersistence implements StatePersistenceService {
  save = vi.fn(async () => {});
  scheduleSave = vi.fn();
  flush = vi.fn(async () => {});
  load = vi.fn(async () => ({
    manifestSource: "none" as const,
    restoredVideos: 0,
    restoredJobs: 0,
    canceledInterruptedJobs: 0,
    failedMissingOutputJobs: 0,
    skippedDanglingJobs: 0,
    removedPartialArtifacts: 0,
    recoveredFromBackup: false
  }));

  async fileHash(filePath: string): Promise<string> {
    return createHash("sha256")
      .update(await readFile(filePath))
      .digest("hex");
  }
}

class FakeProbe implements MediaProbe {
  probe = vi.fn(async (): Promise<FFprobeResult> => validProbe());
}

async function makeHarness(): Promise<{
  root: string;
  storage: StorageBoundary;
  videos: InMemoryVideoRepository;
  persistence: FakePersistence;
  probe: FakeProbe;
  service: MediaAdmissionService;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-video-admission-"));
  tempDirs.push(root);
  const storage = new StorageBoundary({
    root,
    uploads: path.join(root, "uploads"),
    outputs: path.join(root, "outputs"),
    tmp: path.join(root, "tmp"),
    "upload-staging": path.join(root, "tmp", "upload-staging")
  });
  await storage.initialize();
  const videos = new InMemoryVideoRepository();
  const persistence = new FakePersistence();
  const probe = new FakeProbe();
  return {
    root,
    storage,
    videos,
    persistence,
    probe,
    service: new MediaAdmissionService(videos, probe, persistence, storage, 1024)
  };
}

function validProbe(overrides: Partial<FFprobeResult> = {}): FFprobeResult {
  return {
    format: { duration: "2.5", size: "24", format_name: "mov,mp4,m4a,3gp,3g2,mj2", ...(overrides.format ?? {}) },
    streams: [
      { codec_type: "video", codec_name: "h264", width: 1280, height: 720, avg_frame_rate: "24/1" },
      { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 },
      ...(overrides.streams ?? [])
    ]
  };
}

async function stagedFile(root: string, bytes = mp4Bytes): Promise<string> {
  const filePath = path.join(root, "tmp", "upload-staging", `upload-${Math.random().toString(16).slice(2)}`);
  await writeFile(filePath, bytes);
  return filePath;
}

async function exists(filePath: string): Promise<boolean> {
  return stat(filePath)
    .then(() => true)
    .catch(() => false);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("MediaAdmissionService", () => {
  it("admits valid staged media into uploads after signature and probe validation", async () => {
    const { root, service, videos, persistence, probe } = await makeHarness();
    const uploadPath = await stagedFile(root);

    const record = await service.admit(
      { path: uploadPath, originalName: "clip!.mp4", area: "upload-staging" },
      "2026-07-14T00:00:00.000Z"
    );

    expect(record.originalName).toBe("clip!.mp4");
    expect(record.storedPath).toMatch(/uploads[/\\].+\.mp4$/);
    expect(await exists(uploadPath)).toBe(false);
    expect(await exists(record.storedPath)).toBe(true);
    expect(videos.get(record.id)).toBe(record);
    expect(probe.probe).toHaveBeenCalledWith(uploadPath);
    expect(persistence.save).toHaveBeenCalledTimes(1);
  });

  it("removes duplicate staged uploads and reuses the existing video", async () => {
    const { root, service, videos } = await makeHarness();
    const firstPath = await stagedFile(root);
    const first = await service.admit({ path: firstPath, originalName: "first.mp4", area: "upload-staging" });
    const duplicatePath = await stagedFile(root);

    const duplicate = await service.admit({
      path: duplicatePath,
      originalName: "duplicate.mp4",
      area: "upload-staging"
    });

    expect(duplicate).toBe(first);
    expect(videos.getAll()).toHaveLength(1);
    expect(await exists(duplicatePath)).toBe(false);
  });

  it("rejects unsupported bytes before probing and removes the staged file", async () => {
    const { root, service, probe } = await makeHarness();
    const uploadPath = await stagedFile(root, Buffer.from("definitely not video"));

    await expect(
      service.admit({ path: uploadPath, originalName: "fake.mp4", area: "upload-staging" })
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE"
    });
    expect(probe.probe).not.toHaveBeenCalled();
    expect(await exists(uploadPath)).toBe(false);
  });

  it("maps empty and oversized files to upload admission errors", async () => {
    const { root, service } = await makeHarness();
    const empty = await stagedFile(root, Buffer.alloc(0));
    const large = await stagedFile(root, Buffer.alloc(2048, 1));

    await expect(
      service.admit({ path: empty, originalName: "empty.mp4", area: "upload-staging" })
    ).rejects.toMatchObject({
      code: "UPLOAD_EMPTY_FILE"
    });
    await expect(
      service.admit({ path: large, originalName: "large.mp4", area: "upload-staging" })
    ).rejects.toMatchObject({
      code: "UPLOAD_TOO_LARGE"
    });
  });

  it("rolls back the permanent file and repository record if persistence fails", async () => {
    const { root, service, videos, persistence } = await makeHarness();
    persistence.save.mockRejectedValueOnce(new Error("disk full"));
    const uploadPath = await stagedFile(root);

    await expect(service.admit({ path: uploadPath, originalName: "clip.mp4", area: "upload-staging" })).rejects.toThrow(
      "disk full"
    );

    expect(videos.getAll()).toHaveLength(0);
    expect(await exists(uploadPath)).toBe(false);
  });

  it("rejects attached-picture-only media as invalid", async () => {
    const { root, service, probe } = await makeHarness();
    probe.probe.mockResolvedValueOnce({
      format: { duration: "2", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
      streams: [
        {
          codec_type: "video",
          codec_name: "mjpeg",
          width: 1200,
          height: 800,
          disposition: { attached_pic: 1 }
        } as FFprobeStream
      ]
    });
    const uploadPath = await stagedFile(root);

    await expect(
      service.admit({ path: uploadPath, originalName: "album-art.mp4", area: "upload-staging" })
    ).rejects.toMatchObject({
      code: "INVALID_MEDIA"
    });
    expect(await exists(uploadPath)).toBe(false);
  });

  it("rejects audio-only, invalid dimensions, invalid duration, and probe failures", async () => {
    const { root, service, probe } = await makeHarness();
    probe.probe.mockResolvedValueOnce({
      format: { duration: "2", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
      streams: [{ codec_type: "audio", codec_name: "aac" }]
    });
    await expect(
      service.admit({ path: await stagedFile(root), originalName: "audio.mp4", area: "upload-staging" })
    ).rejects.toMatchObject({ code: "INVALID_MEDIA" });

    probe.probe.mockResolvedValueOnce({
      format: { duration: "2", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
      streams: [{ codec_type: "video", codec_name: "h264", width: 0, height: 720 }]
    });
    await expect(
      service.admit({ path: await stagedFile(root), originalName: "bad-width.mp4", area: "upload-staging" })
    ).rejects.toMatchObject({ code: "INVALID_MEDIA" });

    probe.probe.mockResolvedValueOnce(validProbe({ format: { duration: "NaN" } }));
    await expect(
      service.admit({ path: await stagedFile(root), originalName: "bad-duration.mp4", area: "upload-staging" })
    ).rejects.toMatchObject({ code: "INVALID_MEDIA" });

    probe.probe.mockRejectedValueOnce(new Error("ffprobe failed"));
    await expect(
      service.admit({ path: await stagedFile(root), originalName: "probe-fails.mp4", area: "upload-staging" })
    ).rejects.toMatchObject({ code: "INVALID_MEDIA" });
  });
});
