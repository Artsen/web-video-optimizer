import { describe, expect, it } from "vitest";
import type { VideoEntity } from "../entities/video-entity.js";
import { InMemoryVideoRepository } from "./in-memory-video-repository.js";

function video(overrides: Partial<VideoEntity> = {}): VideoEntity {
  return {
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
    },
    ...overrides
  };
}

describe("InMemoryVideoRepository", () => {
  it("starts empty", () => {
    expect(new InMemoryVideoRepository().getAll()).toEqual([]);
  });

  it("inserts and retrieves a video", () => {
    const repository = new InMemoryVideoRepository();
    const record = video();

    repository.set(record);

    expect(repository.get(record.id)).toBe(record);
  });

  it("replaces an existing ID", () => {
    const repository = new InMemoryVideoRepository();
    repository.set(video({ originalName: "first.mp4" }));
    repository.set(video({ originalName: "second.mp4" }));

    expect(repository.get("video-1")?.originalName).toBe("second.mp4");
    expect(repository.getAll()).toHaveLength(1);
  });

  it("retrieves all videos", () => {
    const repository = new InMemoryVideoRepository();
    repository.set(video({ id: "video-1" }));
    repository.set(video({ id: "video-2" }));

    expect(repository.getAll().map((record) => record.id)).toEqual(["video-1", "video-2"]);
  });

  it("deletes existing videos", () => {
    const repository = new InMemoryVideoRepository();
    repository.set(video());

    expect(repository.delete("video-1")).toBe(true);
    expect(repository.get("video-1")).toBeUndefined();
  });

  it("returns false when deleting a missing video", () => {
    expect(new InMemoryVideoRepository().delete("missing")).toBe(false);
  });

  it("finds by source hash", () => {
    const repository = new InMemoryVideoRepository();
    repository.set(video({ id: "video-1", sourceHash: "hash-1" }));
    repository.set(video({ id: "video-2", sourceHash: "hash-2" }));

    expect(repository.findBySourceHash("hash-2")?.id).toBe("video-2");
    expect(repository.findBySourceHash("missing")).toBeUndefined();
  });

  it("clears videos", () => {
    const repository = new InMemoryVideoRepository();
    repository.set(video());

    repository.clear();

    expect(repository.getAll()).toEqual([]);
  });

  it("keeps repository instances isolated", () => {
    const first = new InMemoryVideoRepository();
    const second = new InMemoryVideoRepository();

    first.set(video());

    expect(second.getAll()).toEqual([]);
  });

  it("returns a new array from getAll", () => {
    const repository = new InMemoryVideoRepository();
    repository.set(video());

    expect(repository.getAll()).not.toBe(repository.getAll());
  });
});
