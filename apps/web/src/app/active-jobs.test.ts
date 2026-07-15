import { describe, expect, it } from "vitest";
import type { HistorySnapshot, JobDto } from "@local-video-optimizer/contracts";
import {
  activeJobsList,
  clearActiveJobsById,
  emptyActiveJobs,
  restoreActiveJobsFromHistory,
  selectActiveJobVariation,
  setActiveJobRole,
  updateActiveJobsById
} from "./active-jobs";
import { job as makeJob, videoRecord as makeVideo } from "../testing/fixtures";

describe("active job model", () => {
  it("sets each typed job role without changing unrelated roles", () => {
    const primary = makeJob({ id: "encode-1", kind: "encode" });
    const poster = makeJob({ id: "poster-1", kind: "poster" });

    const withPrimary = setActiveJobRole(emptyActiveJobs, "primary", primary);
    const withPoster = setActiveJobRole(withPrimary, "poster", poster);

    expect(withPoster.primary).toBe(primary);
    expect(withPoster.poster).toBe(poster);
    expect(withPoster.sample).toBeNull();
  });

  it("updates all matching roles by job id", () => {
    const mux = makeJob({ id: "mux-1", kind: "mux", status: "running" });
    const activeJobs = { ...emptyActiveJobs, primary: mux, mux };
    const updated = { ...mux, status: "completed" as const };

    expect(updateActiveJobsById(activeJobs, updated)).toMatchObject({
      primary: { status: "completed" },
      mux: { status: "completed" }
    });
  });

  it("clears matching roles while preserving unrelated jobs", () => {
    const primary = makeJob({ id: "encode-1", kind: "encode" });
    const poster = makeJob({ id: "poster-1", kind: "poster" });
    const activeJobs = { ...emptyActiveJobs, primary, poster };

    expect(clearActiveJobsById(activeJobs, "encode-1")).toEqual({ ...emptyActiveJobs, poster });
  });

  it("restores the latest role jobs from history", () => {
    const video = { ...makeVideo({ id: "video-1" }), jobIds: ["encode-1", "subtitle-1"] };
    const encode = makeJob({ id: "encode-1", videoId: video.id, kind: "encode", startedAt: "2026-01-02T00:00:00Z" });
    const subtitle = makeJob({
      id: "subtitle-1",
      videoId: video.id,
      kind: "subtitle",
      startedAt: "2026-01-01T00:00:00Z"
    });
    const otherVideoJob = makeJob({ id: "other-1", videoId: "other-video", kind: "poster" });
    const history: HistorySnapshot = { videos: [video], jobs: [encode, subtitle, otherVideoJob] };

    expect(restoreActiveJobsFromHistory(history, video.id)).toMatchObject({
      primary: { id: "encode-1" },
      subtitle: { id: "subtitle-1" },
      poster: null
    });
  });

  it("selects completed output variations as the primary comparison job", () => {
    const previous = makeJob({ id: "encode-1", kind: "encode" });
    const mux = makeJob({ id: "mux-1", kind: "mux", status: "completed" });

    expect(selectActiveJobVariation({ ...emptyActiveJobs, primary: previous }, mux)).toMatchObject({
      primary: { id: "mux-1" },
      mux: { id: "mux-1" }
    });
  });

  it("returns only present active jobs", () => {
    const primary: JobDto = makeJob({ id: "encode-1", kind: "encode" });

    expect(activeJobsList({ ...emptyActiveJobs, primary })).toEqual([primary]);
  });
});
