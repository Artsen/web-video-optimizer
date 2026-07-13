import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManifestSnapshot } from "../entities/manifest.js";
import { FileManifestStore, ManifestLoadError } from "./file-manifest-store.js";

const tempDirs: string[] = [];

async function tempManifestPath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "web-video-manifest-"));
  tempDirs.push(dir);
  return path.join(dir, "manifest.json");
}

function snapshot(overrides: Partial<ManifestSnapshot> = {}): ManifestSnapshot {
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
    ],
    ...overrides
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("FileManifestStore", () => {
  it("returns an explicit missing result for a missing manifest and backup", async () => {
    await expect(new FileManifestStore(await tempManifestPath()).load()).resolves.toEqual({ kind: "missing" });
  });

  it("round-trips saved snapshots and preserves internal private fields", async () => {
    const store = new FileManifestStore(await tempManifestPath());
    const manifest = snapshot();

    await store.save(manifest);

    await expect(store.load()).resolves.toEqual({
      kind: "loaded",
      snapshot: manifest,
      source: "primary",
      recoveredFromBackup: false
    });
  });

  it("saves empty manifests with pretty JSON", async () => {
    const manifestPath = await tempManifestPath();
    const store = new FileManifestStore(manifestPath);

    await store.save({ videos: [], jobs: [] });

    await expect(readFile(manifestPath, "utf8")).resolves.toBe('{\n  "videos": [],\n  "jobs": []\n}');
  });

  it("preserves the previous valid primary as the backup on replacement", async () => {
    const manifestPath = await tempManifestPath();
    const store = new FileManifestStore(manifestPath);
    const first = snapshot();
    const second = snapshot({ jobs: [] });

    await store.save(first);
    await store.save(second);

    await expect(readFile(manifestPath, "utf8").then(JSON.parse)).resolves.toEqual(second);
    await expect(readFile(`${manifestPath}.bak`, "utf8").then(JSON.parse)).resolves.toEqual(first);
  });

  it("recovers from a valid backup when the primary is corrupt or missing", async () => {
    const manifestPath = await tempManifestPath();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await writeFile(`${manifestPath}.bak`, JSON.stringify(snapshot(), null, 2));

    await writeFile(manifestPath, "{nope", "utf8");
    await expect(new FileManifestStore(manifestPath).load()).resolves.toMatchObject({
      kind: "loaded",
      source: "backup",
      recoveredFromBackup: true
    });
    expect(warn).toHaveBeenCalledWith("Primary manifest is invalid; recovered state from backup manifest.");

    await rm(manifestPath, { force: true });
    await expect(new FileManifestStore(manifestPath).load()).resolves.toMatchObject({
      kind: "loaded",
      source: "backup",
      recoveredFromBackup: true
    });
  });

  it("fails startup clearly when primary and backup are corrupt", async () => {
    const manifestPath = await tempManifestPath();
    await writeFile(manifestPath, "{nope", "utf8");
    await writeFile(`${manifestPath}.bak`, "{also-nope", "utf8");

    await expect(new FileManifestStore(manifestPath).load()).rejects.toBeInstanceOf(ManifestLoadError);
  });

  it("rejects invalid internal manifest structure", async () => {
    const manifestPath = await tempManifestPath();
    await writeFile(manifestPath, JSON.stringify({ videos: [{}], jobs: [] }), "utf8");

    await expect(new FileManifestStore(manifestPath).load()).rejects.toBeInstanceOf(ManifestLoadError);
  });

  it("keeps different manifest paths isolated and cleans attempted temp files", async () => {
    const firstPath = await tempManifestPath();
    const secondPath = await tempManifestPath();
    const first = new FileManifestStore(firstPath);
    const second = new FileManifestStore(secondPath);

    await first.save(snapshot());
    await second.save({ videos: [], jobs: [] });

    await expect(first.load()).resolves.toMatchObject({ kind: "loaded", snapshot: snapshot() });
    await expect(second.load()).resolves.toMatchObject({ kind: "loaded", snapshot: { videos: [], jobs: [] } });
    await expect(readdir(path.dirname(firstPath))).resolves.not.toContain(expect.stringContaining(".tmp"));
  });

  it("expects the parent directory to already exist when saving and leaves no temp file there", async () => {
    const missingParent = path.join(await tempManifestPath(), "missing", "manifest.json");

    await expect(new FileManifestStore(missingParent).save({ videos: [], jobs: [] })).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});
