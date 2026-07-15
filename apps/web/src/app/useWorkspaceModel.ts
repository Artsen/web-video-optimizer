import React from "react";
import type { HistorySnapshot, JobDto, PackageMetadata, VideoRecordDto } from "@local-video-optimizer/contracts";
import {
  bestSavingsJob as selectBestSavingsJob,
  completedOutputJobs as selectCompletedOutputJobs,
  finishedOutputJobs as selectFinishedOutputJobs,
  hasCompletedCaptions,
  hasCompletedPoster,
  hasFallbackOutput,
  hasModernOutput,
  jobsForVideo,
  packageCandidateJobs as selectPackageCandidateJobs,
  packagePreviewSize as selectPackagePreviewSize,
  runningJobs as selectRunningJobs,
  selectedPackageJobs as selectSelectedPackageJobs
} from "../domain/app-selectors";

type Job = JobDto;
type VideoRecord = VideoRecordDto;

export function useWorkspaceModel({
  video,
  history,
  liveJobs,
  selectedPackageJobIds,
  packageMetadata
}: {
  video: VideoRecord | null;
  history: HistorySnapshot;
  liveJobs: Array<Job | null>;
  selectedPackageJobIds: string[];
  packageMetadata: PackageMetadata;
}) {
  const currentVideoJobs = React.useMemo(() => {
    if (!video) return [];
    const byId = new Map<string, Job>(jobsForVideo(history, video.id).map((historyJob) => [historyJob.id, historyJob]));
    for (const liveJob of liveJobs) {
      if (liveJob?.videoId === video.id) byId.set(liveJob.id, liveJob);
    }
    return Array.from(byId.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [history, liveJobs, video]);

  const completedEncodeJobs = selectCompletedOutputJobs(currentVideoJobs).filter(
    (historyJob) => historyJob.kind === "encode" || historyJob.kind === "mux"
  );
  const hasModernExport = hasModernOutput(currentVideoJobs);
  const hasFallbackExport = hasFallbackOutput(currentVideoJobs);
  const hasPoster = liveJobs.some((liveJob) => liveJob?.kind === "poster" && liveJob.status === "completed")
    ? true
    : hasCompletedPoster(currentVideoJobs);
  const hasCaptions = liveJobs.some((liveJob) => liveJob?.kind === "subtitle" && liveJob.status === "completed")
    ? true
    : hasCompletedCaptions(currentVideoJobs);
  const packageCandidateJobs = selectPackageCandidateJobs(currentVideoJobs);
  const explicitPackageSelection = selectedPackageJobIds.filter((jobId) =>
    packageCandidateJobs.some((historyJob) => historyJob.id === jobId)
  );
  const packageJobIds =
    explicitPackageSelection.length > 0
      ? explicitPackageSelection
      : packageCandidateJobs.map((historyJob) => historyJob.id);
  const bestSavingsJob = selectBestSavingsJob(completedEncodeJobs);
  const runningJobs = selectRunningJobs(currentVideoJobs);
  const finishedOutputJobs = selectFinishedOutputJobs(currentVideoJobs);
  const completedOutputJobs = selectCompletedOutputJobs(currentVideoJobs);
  const selectedPackageJobs = selectSelectedPackageJobs(currentVideoJobs, packageJobIds);
  const packagePreviewSize = selectPackagePreviewSize(selectedPackageJobs);
  const packageSavings =
    video && packagePreviewSize > 0 ? Math.round((1 - packagePreviewSize / video.metadata.fileSize) * 100) : undefined;
  const packageMetadataReady = Boolean(
    packageMetadata.title.trim() &&
    packageMetadata.description.trim() &&
    packageMetadata.language.trim() &&
    packageMetadata.filenamePrefix.trim()
  );
  const currentStatus =
    runningJobs.length > 0
      ? `${runningJobs.length} running`
      : liveJobs.some((liveJob) => liveJob?.kind === "package" && liveJob.status === "completed")
        ? "Package ready"
        : completedOutputJobs.length > 0
          ? "Outputs ready"
          : video
            ? "Ready"
            : "No video";

  return {
    currentVideoJobs,
    completedEncodeJobs,
    hasModernExport,
    hasFallbackExport,
    hasPoster,
    hasCaptions,
    packageCandidateJobs,
    packageJobIds,
    bestSavingsJob,
    runningJobs,
    finishedOutputJobs,
    completedOutputJobs,
    selectedPackageJobs,
    packagePreviewSize,
    packageSavings,
    packageMetadataReady,
    currentStatus
  };
}
