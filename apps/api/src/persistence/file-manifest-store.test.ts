import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManifestSnapshot } from "../entities/manifest.js";
import { FileManifestStore } from "./file-manifest-store.js";

const tempDirs: string[] = [];

async function tempManifestPath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "web-video-manifest-"));
  tempDirs.push(dir);
  return path.join(dir, "manifest.json");
}

function snapshot(): ManifestSnapshot {
  return {
    videos: [
      {
        id: "video-1",
        originalName: "source.mp4",
        storedPath: "uploads/video-1.mp4",
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
        }
      }
    ],
    jobs: [
      {
        id: "job-1",
        videoId: "video-1",
        status: "completed",
        kind: "subtitle",
        progress: 100,
        outputPath: "outputs/job-1-captions.vtt",
        outputFileName: "captions.vtt",
        sidecarPath: "outputs/job-1-captions.srt",
        sidecarFileName: "captions.srt",
        ffmpegCommand: "whisper",
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
          outputFilename: "captions"
        }
      }
    ]
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("FileManifestStore", () => {
  it("returns undefined for a missing manifest", async () => {
    await expect(new FileManifestStore(await tempManifestPath()).load()).resolves.toBeUndefined();
  });

  it("round-trips saved snapshots", async () => {
    const store = new FileManifestStore(await tempManifestPath());
    const manifest = snapshot();

    await store.save(manifest);

    await expect(store.load()).resolves.toEqual(manifest);
  });

  it("preserves internal private fields", async () => {
    const store = new FileManifestStore(await tempManifestPath());

    await store.save(snapshot());

    const loaded = await store.load();
    expect(loaded?.videos[0]).toMatchObject({ storedPath: "uploads/video-1.mp4", sourceHash: "hash-1" });
    expect(loaded?.jobs[0]).toMatchObject({
      outputPath: "outputs/job-1-captions.vtt",
      sidecarPath: "outputs/job-1-captions.srt"
    });
  });

  it("saves and loads an empty manifest", async () => {
    const store = new FileManifestStore(await tempManifestPath());
    const empty: ManifestSnapshot = { videos: [], jobs: [] };

    await store.save(empty);

    await expect(store.load()).resolves.toEqual(empty);
  });

  it("writes formatted JSON", async () => {
    const manifestPath = await tempManifestPath();
    const store = new FileManifestStore(manifestPath);

    await store.save({ videos: [], jobs: [] });

    await expect(readFile(manifestPath, "utf8")).resolves.toBe('{\n  "videos": [],\n  "jobs": []\n}');
  });

  it("returns undefined and warns for malformed JSON", async () => {
    const manifestPath = await tempManifestPath();
    await import("node:fs/promises").then((fs) => fs.writeFile(manifestPath, "{nope", "utf8"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(new FileManifestStore(manifestPath).load()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith("Unable to load manifest:", expect.any(SyntaxError));
  });

  it("keeps different manifest paths isolated", async () => {
    const first = new FileManifestStore(await tempManifestPath());
    const second = new FileManifestStore(await tempManifestPath());

    await first.save(snapshot());
    await second.save({ videos: [], jobs: [] });

    await expect(first.load()).resolves.toEqual(snapshot());
    await expect(second.load()).resolves.toEqual({ videos: [], jobs: [] });
  });

  it("expects the parent directory to already exist when saving", async () => {
    const missingParent = path.join(await tempManifestPath(), "missing", "manifest.json");

    await expect(new FileManifestStore(missingParent).save({ videos: [], jobs: [] })).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});
