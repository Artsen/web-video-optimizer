import React from "react";
import type { HistorySnapshot, JobDto, VideoRecordDto } from "@local-video-optimizer/contracts";
import type { AppDependencies } from "./app-dependencies";
import type { Settings } from "./app-config";
import { getReadableApiError } from "../api/api-error";

type Job = JobDto;
type VideoRecord = VideoRecordDto;

export function useMediaJobWorkflow({
  api,
  currentVideoJobs,
  hasPoster,
  jobSubscriptions,
  mergeHistoryJob,
  posterJob,
  posterTimestamp,
  refreshHistory,
  settings,
  subtitleJob,
  video,
  clearActiveJobById,
  setActiveJobRole,
  setError,
  setHistory,
  requestResultsReveal,
  updateActiveJobById
}: {
  api: AppDependencies["api"];
  currentVideoJobs: Job[];
  hasPoster: boolean;
  jobSubscriptions: { subscribe(job: Job): void };
  mergeHistoryJob: (updated: Job) => void;
  posterJob: Job | null;
  posterTimestamp: number;
  refreshHistory: () => Promise<void>;
  settings: Settings;
  subtitleJob: Job | null;
  video: VideoRecord | null;
  clearActiveJobById: (jobId: string) => void;
  setActiveJobRole: (role: "primary" | "sample" | "poster" | "package" | "subtitle" | "mux", job: Job | null) => void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setHistory: React.Dispatch<React.SetStateAction<HistorySnapshot>>;
  requestResultsReveal: (sourceId: string) => void;
  updateActiveJobById: (updated: Job) => void;
}) {
  async function startJob() {
    if (!video) return;
    setError(null);
    try {
      const nextJob = await api.createOptimizationJob(video.id, settings);
      setActiveJobRole("primary", nextJob);
      requestResultsReveal(video.id);
      jobSubscriptions.subscribe(nextJob);
      void refreshHistory();
    } catch (jobError) {
      setError(getReadableApiError(jobError));
    }
  }

  async function startSampleJob() {
    if (!video) return;
    setError(null);
    try {
      const nextJob = await api.createSampleJob(video.id, settings, 5);
      setActiveJobRole("sample", nextJob);
      requestResultsReveal(video.id);
      jobSubscriptions.subscribe(nextJob);
      void refreshHistory();
    } catch (jobError) {
      setError(getReadableApiError(jobError));
    }
  }

  async function startPosterJob() {
    if (!video) return;
    setError(null);
    const atSeconds = Math.max(0, Math.min(posterTimestamp, Math.max(0, video.metadata.durationSeconds - 0.1)));
    try {
      const nextJob = await api.createPosterJob(video.id, atSeconds);
      setActiveJobRole("poster", nextJob);
      requestResultsReveal(video.id);
      jobSubscriptions.subscribe(nextJob);
      void refreshHistory();
    } catch (jobError) {
      setError(getReadableApiError(jobError));
    }
  }

  async function startSubtitleJob() {
    if (!video) return;
    setError(null);
    try {
      const nextJob = await api.createSubtitleJob(video.id);
      setActiveJobRole("subtitle", nextJob);
      requestResultsReveal(video.id);
      jobSubscriptions.subscribe(nextJob);
      void refreshHistory();
    } catch (jobError) {
      setError(getReadableApiError(jobError));
    }
  }

  async function startPairJobs() {
    if (!video) return;
    setError(null);
    try {
      const payload = await api.createPairJobs(video.id, settings);
      const primary = payload.jobs[0];
      if (primary) setActiveJobRole("primary", primary);
      requestResultsReveal(video.id);
      payload.jobs.forEach(jobSubscriptions.subscribe);
      void refreshHistory();
    } catch (jobError) {
      setError(getReadableApiError(jobError));
    }
  }

  async function optimizeForWebsite() {
    if (!video) return;
    setError(null);
    await startPairJobs();
    if (posterJob?.status !== "running" && !hasPoster) {
      await startPosterJob();
    }
  }

  async function cancelJob(target: Job | null) {
    if (!target) return;
    let updated: Job;
    try {
      updated = await api.cancelJob(target.id);
    } catch {
      return;
    }
    if (updated.status === "canceled") {
      setHistory((current) => ({
        ...current,
        jobs: current.jobs.filter((historyJob) => historyJob.id !== updated.id)
      }));
      clearActiveJobById(updated.id);
      void refreshHistory();
      return;
    }
    updateActiveJobById(updated);
    void refreshHistory();
  }

  async function renameJobOutput(target: Job, nextName: string) {
    if (!nextName) return;
    setError(null);
    try {
      const updated = await api.renameJob(target.id, nextName);
      mergeHistoryJob(updated);
      updateActiveJobById(updated);
      void refreshHistory();
      return updated;
    } catch (renameError) {
      setError(getReadableApiError(renameError));
      return undefined;
    }
  }

  async function revealJobOutput(target: Job) {
    try {
      await api.revealJob(target.id);
    } catch (revealError) {
      setError(getReadableApiError(revealError));
    }
  }

  async function muxSubtitlesIntoVideo(target: Job) {
    const captions =
      subtitleJob?.status === "completed"
        ? subtitleJob
        : currentVideoJobs.find((historyJob) => historyJob.kind === "subtitle" && historyJob.status === "completed");
    if (!captions) {
      setError("Generate subtitles before embedding them into a video file.");
      return;
    }

    setError(null);
    try {
      const nextJob = await api.createMuxJob(target.id, captions.id);
      setActiveJobRole("mux", nextJob);
      requestResultsReveal(target.videoId);
      jobSubscriptions.subscribe(nextJob);
      void refreshHistory();
    } catch (muxError) {
      setError(getReadableApiError(muxError));
    }
  }

  return {
    cancelJob,
    muxSubtitlesIntoVideo,
    optimizeForWebsite,
    renameJobOutput,
    revealJobOutput,
    startJob,
    startPairJobs,
    startPosterJob,
    startSampleJob,
    startSubtitleJob
  };
}
