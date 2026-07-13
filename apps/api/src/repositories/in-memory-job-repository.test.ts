import { describe, expect, it } from "vitest";
import type { JobEntity } from "../entities/job-entity.js";
import { InMemoryJobRepository } from "./in-memory-job-repository.js";

function job(overrides: Partial<JobEntity> = {}): JobEntity {
  return {
    id: "job-1",
    videoId: "video-1",
    status: "completed",
    kind: "encode",
    progress: 100,
    outputPath: "outputs/job-1-output.mp4",
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

describe("InMemoryJobRepository", () => {
  it("starts empty", () => {
    expect(new InMemoryJobRepository().getAll()).toEqual([]);
  });

  it("inserts and retrieves a job", () => {
    const repository = new InMemoryJobRepository();
    const record = job();

    repository.set(record);

    expect(repository.get(record.id)).toBe(record);
  });

  it("replaces an existing ID", () => {
    const repository = new InMemoryJobRepository();
    repository.set(job({ progress: 10 }));
    repository.set(job({ progress: 90 }));

    expect(repository.get("job-1")?.progress).toBe(90);
    expect(repository.getAll()).toHaveLength(1);
  });

  it("retrieves all jobs", () => {
    const repository = new InMemoryJobRepository();
    repository.set(job({ id: "job-1" }));
    repository.set(job({ id: "job-2" }));

    expect(repository.getAll().map((record) => record.id)).toEqual(["job-1", "job-2"]);
  });

  it("filters by video ID", () => {
    const repository = new InMemoryJobRepository();
    repository.set(job({ id: "job-1", videoId: "video-1" }));
    repository.set(job({ id: "job-2", videoId: "video-2" }));
    repository.set(job({ id: "job-3", videoId: "video-1" }));

    expect(repository.findByVideoId("video-1").map((record) => record.id)).toEqual(["job-1", "job-3"]);
  });

  it("deletes existing jobs", () => {
    const repository = new InMemoryJobRepository();
    repository.set(job());

    expect(repository.delete("job-1")).toBe(true);
    expect(repository.get("job-1")).toBeUndefined();
  });

  it("returns false when deleting a missing job", () => {
    expect(new InMemoryJobRepository().delete("missing")).toBe(false);
  });

  it("clears jobs", () => {
    const repository = new InMemoryJobRepository();
    repository.set(job());

    repository.clear();

    expect(repository.getAll()).toEqual([]);
  });

  it("keeps repository instances isolated", () => {
    const first = new InMemoryJobRepository();
    const second = new InMemoryJobRepository();

    first.set(job());

    expect(second.getAll()).toEqual([]);
  });

  it("returns a new array from getAll", () => {
    const repository = new InMemoryJobRepository();
    repository.set(job());

    expect(repository.getAll()).not.toBe(repository.getAll());
  });
});
