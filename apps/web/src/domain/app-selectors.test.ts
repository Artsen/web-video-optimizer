import { describe, expect, it } from "vitest";
import {
  bestSavingsJob,
  completedOutputJobs,
  hasCompletedCaptions,
  hasCompletedPoster,
  hasFallbackOutput,
  hasModernOutput,
  jobsForVideo,
  packagePreviewSize,
  selectedPackageJobs
} from "./app-selectors";
import { historySnapshot, job } from "../testing/fixtures";

describe("app selectors", () => {
  it("returns sorted jobs for the active video without mutating history", () => {
    const older = job({ id: "older", startedAt: "2026-07-14T00:00:00.000Z" });
    const newer = job({ id: "newer", startedAt: "2026-07-14T00:01:00.000Z" });
    const other = job({ id: "other", videoId: "video-2" });
    const history = historySnapshot({ jobs: [older, other, newer] });

    expect(jobsForVideo(history, "video-1").map((item) => item.id)).toEqual(["newer", "older"]);
    expect(history.jobs.map((item) => item.id)).toEqual(["older", "other", "newer"]);
  });

  it("derives package candidates, preview size, and best savings", () => {
    const encode = job({ id: "encode", outputSize: 900 });
    const poster = job({ id: "poster", kind: "poster", outputSize: 100 });
    const failed = job({ id: "failed", status: "failed", outputSize: 10 });
    const selected = selectedPackageJobs([encode, poster, failed], []);

    expect(selected.map((item) => item.id)).toEqual(["encode", "poster"]);
    expect(packagePreviewSize(selected)).toBe(1000);
    expect(bestSavingsJob([encode, poster])?.id).toBe("poster");
  });

  it("detects modern, fallback, poster, caption, and completed output presence", () => {
    const fallback = job({
      id: "fallback",
      settings: { ...job().settings, outputContainer: "mp4", videoCodec: "libx264" }
    });
    const modern = job({
      id: "modern",
      settings: { ...job().settings, outputContainer: "webm", videoCodec: "libaom-av1" }
    });
    const poster = job({ id: "poster", kind: "poster" });
    const subtitle = job({ id: "subtitle", kind: "subtitle" });
    const running = job({ id: "running", status: "running" });
    const jobs = [fallback, modern, poster, subtitle, running];

    expect(hasFallbackOutput(jobs)).toBe(true);
    expect(hasModernOutput(jobs)).toBe(true);
    expect(hasCompletedPoster(jobs)).toBe(true);
    expect(hasCompletedCaptions(jobs)).toBe(true);
    expect(completedOutputJobs(jobs).map((item) => item.id)).not.toContain("running");
  });
});
