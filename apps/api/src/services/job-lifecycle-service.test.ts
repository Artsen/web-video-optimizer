import { describe, expect, it } from "vitest";
import { normalizeOptimizationSettings } from "@local-video-optimizer/video-core";
import type { JobEntity } from "../entities/job-entity.js";
import { JobLifecycleService } from "./job-lifecycle-service.js";

function job(overrides: Partial<JobEntity> = {}): JobEntity {
  return {
    id: "job-1",
    videoId: "video-1",
    status: "queued",
    kind: "encode",
    progress: 0,
    ffmpegCommand: "ffmpeg",
    startedAt: "2026-07-13T12:00:00.000Z",
    settings: normalizeOptimizationSettings({ outputFilename: "output" }),
    ...overrides
  };
}

describe("JobLifecycleService", () => {
  it("allows every valid transition", () => {
    const lifecycle = new JobLifecycleService();

    const started = job();
    expect(lifecycle.start(started, "Running")).toBe(true);
    expect(started).toMatchObject({ status: "running", message: "Running" });
    expect(started.completedAt).toBeUndefined();

    const queuedCanceled = job();
    expect(lifecycle.cancel(queuedCanceled, "Canceled")).toBe(true);
    expect(queuedCanceled).toMatchObject({ status: "canceled", message: "Canceled" });
    expect(queuedCanceled.completedAt).toEqual(expect.any(String));

    const queuedFailed = job();
    expect(lifecycle.fail(queuedFailed, "Failed")).toBe(true);
    expect(queuedFailed).toMatchObject({ status: "failed", message: "Failed" });
    expect(queuedFailed.completedAt).toEqual(expect.any(String));

    const completed = job({ status: "running", progress: 44 });
    expect(lifecycle.complete(completed, "Done")).toBe(true);
    expect(completed).toMatchObject({ status: "completed", progress: 100, message: "Done" });
    expect(completed.completedAt).toEqual(expect.any(String));

    const runningFailed = job({ status: "running" });
    expect(lifecycle.fail(runningFailed, "Nope")).toBe(true);
    expect(runningFailed).toMatchObject({ status: "failed", message: "Nope" });

    const runningCanceled = job({ status: "running" });
    expect(lifecycle.cancel(runningCanceled, "Stop")).toBe(true);
    expect(runningCanceled).toMatchObject({ status: "canceled", message: "Stop" });
  });

  it("rejects invalid terminal and direct transitions without mutation", () => {
    const lifecycle = new JobLifecycleService();
    const completed = job({ status: "completed", progress: 100, message: "Done", completedAt: "done" });
    const failed = job({ status: "failed", message: "Failed", completedAt: "failed" });
    const canceled = job({ status: "canceled", message: "Canceled", completedAt: "canceled" });
    const queued = job();

    expect(lifecycle.start(completed, "Again")).toBe(false);
    expect(lifecycle.fail(completed, "Late failure")).toBe(false);
    expect(lifecycle.complete(failed, "Late completion")).toBe(false);
    expect(lifecycle.fail(canceled, "Late error")).toBe(false);
    expect(lifecycle.complete(canceled, "Late close")).toBe(false);
    expect(lifecycle.complete(queued, "Skipped running")).toBe(false);

    expect(completed).toMatchObject({ status: "completed", message: "Done", completedAt: "done" });
    expect(failed).toMatchObject({ status: "failed", message: "Failed", completedAt: "failed" });
    expect(canceled).toMatchObject({ status: "canceled", message: "Canceled", completedAt: "canceled" });
    expect(queued).toMatchObject({ status: "queued", progress: 0 });
  });

  it("updates progress only while running and clamps bounds", () => {
    const lifecycle = new JobLifecycleService();
    const queued = job();
    const running = job({ status: "running" });
    const completed = job({ status: "completed", progress: 100 });

    expect(lifecycle.updateProgress(queued, 50, "Queued progress")).toBe(false);
    expect(lifecycle.updateProgress(completed, 50, "Late progress")).toBe(false);
    expect(lifecycle.updateProgress(running, -10, "Low")).toBe(true);
    expect(running).toMatchObject({ progress: 0, message: "Low" });
    expect(lifecycle.updateProgress(running, 125, "High")).toBe(true);
    expect(running).toMatchObject({ progress: 100, message: "High" });
  });

  it("reports terminal states", () => {
    const lifecycle = new JobLifecycleService();

    expect(lifecycle.isTerminal(job({ status: "queued" }))).toBe(false);
    expect(lifecycle.isTerminal(job({ status: "running" }))).toBe(false);
    expect(lifecycle.isTerminal(job({ status: "completed" }))).toBe(true);
    expect(lifecycle.isTerminal(job({ status: "failed" }))).toBe(true);
    expect(lifecycle.isTerminal(job({ status: "canceled" }))).toBe(true);
  });
});
