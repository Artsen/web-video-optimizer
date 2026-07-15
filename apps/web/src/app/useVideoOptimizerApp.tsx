import React from "react";
import type { AppDependencies } from "./app-dependencies";
import { buildVideoMarkup } from "../domain/job-presenters";
import { jobDownloadUrl, jobOutputUrl, videoDownloadUrl, videoSourceUrl } from "../api/urls";
import { useSynchronizedPlayback } from "../features/compare/use-synchronized-playback";
import { useActiveJobs } from "./useActiveJobs";
import { useAppBootstrap } from "./useAppBootstrap";
import { useCaptionWorkflow } from "./useCaptionWorkflow";
import { useCustomSettings } from "./useCustomSettings";
import { useJobSubscriptions } from "./useJobSubscriptions";
import { useMediaJobWorkflow } from "./useMediaJobWorkflow";
import { usePackageWorkflow } from "./usePackageWorkflow";
import { usePosterLightbox } from "./usePosterLightbox";
import { useSourceWorkflow } from "./useSourceWorkflow";
import { useWorkspaceModel } from "./useWorkspaceModel";
import type {
  Capabilities,
  HistorySnapshot,
  JobDto,
  PackageMetadata,
  VideoRecordDto
} from "@local-video-optimizer/contracts";

type VideoRecord = VideoRecordDto;
type Job = JobDto;

export function useVideoOptimizerApp(dependencies: AppDependencies) {
  const { api, apiBaseUrl, jobEvents } = dependencies;
  const [video, setVideo] = React.useState<VideoRecord | null>(null);
  const customSettings = useCustomSettings(video);
  const {
    activePreset,
    applyPreset,
    applyTargetSize,
    estimate,
    presetInfo,
    presets,
    recommendations,
    setSettings,
    settings,
    updateOutputContainer,
    updateVideoCodec
  } = customSettings;
  const [isUploading, setIsUploading] = React.useState(false);
  const [videoUrl, setVideoUrl] = React.useState("");
  const [importStatus, setImportStatus] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  const [activeTab, setActiveTab] = React.useState<"workflow" | "history">("workflow");
  const [activeView, setActiveView] = React.useState<"prepare" | "outputs" | "custom" | "compare" | "captions">(
    "prepare"
  );
  const [history, setHistory] = React.useState<HistorySnapshot>({ videos: [], jobs: [] });
  const [selectedVideoIds, setSelectedVideoIds] = React.useState<string[]>([]);
  const [selectedJobIds, setSelectedJobIds] = React.useState<string[]>([]);
  const [selectedPackageJobIds, setSelectedPackageJobIds] = React.useState<string[]>([]);
  const [sourceNameDraft, setSourceNameDraft] = React.useState("");
  const [renamingSource, setRenamingSource] = React.useState(false);
  const [jobNameDrafts, setJobNameDrafts] = React.useState<Record<string, string>>({});
  const [renamingJobId, setRenamingJobId] = React.useState<string | null>(null);
  const [packageMetadata, setPackageMetadata] = React.useState<PackageMetadata>({
    title: "",
    description: "",
    language: "en",
    filenamePrefix: ""
  });
  const [subtitleDraft, setSubtitleDraft] = React.useState("");
  const [subtitlePreviewKey, setSubtitlePreviewKey] = React.useState(0);
  const [isSavingSubtitles, setIsSavingSubtitles] = React.useState(false);
  const [capabilities, setCapabilities] = React.useState<Capabilities | null>(null);
  const [posterTimestamp, setPosterTimestamp] = React.useState(0);
  const sourcePreviewRef = React.useRef<HTMLVideoElement | null>(null);
  const activeJobsController = useActiveJobs();
  const {
    activeJobs,
    editingSubtitleJob,
    setEditingSubtitleJob,
    setRole: setActiveJobRole,
    updateById: updateActiveJobById,
    clearById: clearActiveJobById,
    reset: resetActiveJobs,
    restoreFromHistory: restoreActiveJobsFromHistory,
    selectVariation: selectActiveJobVariation
  } = activeJobsController;
  const job = activeJobs.primary;
  const sampleJob = activeJobs.sample;
  const posterJob = activeJobs.poster;
  const packageJob = activeJobs.package;
  const subtitleJob = activeJobs.subtitle;
  const muxJob = activeJobs.mux;
  const liveJobs = React.useMemo(
    () => [job, sampleJob, posterJob, packageJob, subtitleJob, muxJob],
    [job, muxJob, packageJob, posterJob, sampleJob, subtitleJob]
  );
  const posterLightbox = usePosterLightbox((nextPosterJob) => setActiveJobRole("poster", nextPosterJob));
  const {
    activePosterPreview,
    posterZoom,
    posterPan,
    closePosterLightbox,
    openPosterLightbox,
    updatePosterZoom,
    startPosterPan,
    movePosterPan,
    stopPosterPan
  } = posterLightbox;
  const comparePlayback = useSynchronizedPlayback();
  const {
    syncPlayback,
    setSyncPlayback,
    compareMediaErrors,
    setCompareMediaErrors,
    originalCompareRef,
    optimizedCompareRef,
    syncVideoState
  } = comparePlayback;

  const sourceUrl = video ? videoSourceUrl(apiBaseUrl, video.id) : "";
  const sourceDownloadUrl = video ? videoDownloadUrl(apiBaseUrl, video.id) : "";
  const outputUrl =
    job?.status === "completed" && (job.kind === "encode" || job.kind === "mux")
      ? jobOutputUrl(apiBaseUrl, job.id)
      : "";
  const downloadUrl = job?.status === "completed" ? jobDownloadUrl(apiBaseUrl, job.id) : "";
  const posterUrl = posterJob?.status === "completed" ? jobOutputUrl(apiBaseUrl, posterJob.id) : "";
  const activePosterUrl =
    activePosterPreview?.status === "completed" ? jobOutputUrl(apiBaseUrl, activePosterPreview.id) : "";
  const videoMarkup = job ? buildVideoMarkup(job, job.settings) : "";
  const completedReduction =
    video && job?.outputSize ? Math.round((1 - job.outputSize / video.metadata.fileSize) * 100) : undefined;
  const workspace = useWorkspaceModel({ video, history, liveJobs, selectedPackageJobIds, packageMetadata });
  const {
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
  } = workspace;

  useAppBootstrap({ api, theme, setCapabilities, setHistory });

  const refreshHistory = React.useCallback(async () => {
    try {
      setHistory(await api.getHistory());
    } catch {
      return;
    }
  }, [api]);

  const jobSubscriptions = useJobSubscriptions({
    jobEvents,
    onUpdate(updated) {
      mergeHistoryJob(updated);
      updateActiveJobById(updated);
    },
    onTerminal() {
      void refreshHistory();
    },
    onError() {
      void refreshHistory();
    }
  });

  function mergeHistoryJob(updated: Job) {
    setHistory((current) => {
      const jobsById = new Map(current.jobs.map((historyJob) => [historyJob.id, historyJob]));
      jobsById.set(updated.id, updated);
      return {
        ...current,
        jobs: Array.from(jobsById.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      };
    });
  }

  const { importVideoUrl, loadHistoryVideo, renameSource, startNewVideo, uploadFile, useCurrentPreviewFrame } =
    useSourceWorkflow({
      api,
      history,
      sourceNameDraft,
      video,
      videoUrl,
      sourcePreviewRef,
      setActiveTab,
      setActiveView,
      setCompareMediaErrors,
      setError,
      setHistory,
      setImportStatus,
      setIsUploading,
      setPackageMetadata,
      setPosterTimestamp,
      setSelectedPackageJobIds,
      setSettings,
      setSourceNameDraft,
      setSubtitleDraft,
      setVideo,
      setVideoUrl,
      renamingSource,
      setRenamingSource,
      closeJobSubscriptions: jobSubscriptions.closeAll,
      closePosterLightbox,
      refreshHistory,
      resetActiveJobs,
      restoreActiveJobsFromHistory
    });
  const mediaJobs = useMediaJobWorkflow({
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
    setActiveView,
    setError,
    setHistory,
    updateActiveJobById
  });
  const {
    cancelJob,
    muxSubtitlesIntoVideo,
    optimizeForWebsite,
    revealJobOutput,
    startJob,
    startPairJobs,
    startPosterJob,
    startSampleJob,
    startSubtitleJob
  } = mediaJobs;
  const { createWebPackage, togglePackageJob } = usePackageWorkflow({
    api,
    packageCandidateJobs,
    packageJobIds,
    packageMetadata,
    packageMetadataReady,
    refreshHistory,
    setActiveJobRole,
    setActiveView,
    setError,
    setSelectedPackageJobIds,
    video
  });
  const { openSubtitleEditor, saveSubtitleEdits } = useCaptionWorkflow({
    api,
    editingSubtitleJob,
    refreshHistory,
    setActiveJobRole,
    setActiveView,
    setEditingSubtitleJob,
    setError,
    setIsSavingSubtitles,
    setSubtitleDraft,
    setSubtitlePreviewKey,
    subtitleDraft
  });

  async function renameJobOutput(target: Job) {
    const nextName = (jobNameDrafts[target.id] ?? target.outputFileName ?? "").trim();
    if (!nextName) return;
    setRenamingJobId(target.id);
    try {
      const updated = await mediaJobs.renameJobOutput(target, nextName);
      if (updated) setJobNameDrafts((current) => ({ ...current, [updated.id]: updated.outputFileName ?? nextName }));
    } finally {
      setRenamingJobId(null);
    }
  }

  async function deleteHistoryItems(videoIds = selectedVideoIds, jobIds = selectedJobIds) {
    let nextHistory: HistorySnapshot;
    try {
      nextHistory = await api.deleteHistory(videoIds, jobIds);
    } catch {
      return;
    }
    setHistory(nextHistory);
    setSelectedVideoIds([]);
    setSelectedJobIds([]);
    if (videoIds.includes(video?.id ?? "")) {
      setVideo(null);
      jobSubscriptions.closeAll();
      resetActiveJobs();
      closePosterLightbox();
    }
    jobIds.forEach((jobId) => {
      clearActiveJobById(jobId);
      jobSubscriptions.close(jobId);
    });
    if (jobIds.includes(activePosterPreview?.id ?? "")) {
      closePosterLightbox();
    }
    if (jobIds.includes(editingSubtitleJob?.id ?? "")) {
      setEditingSubtitleJob(null);
      setSubtitleDraft("");
    }
  }

  function toggleSelected(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function selectVariation(nextJob: Job) {
    setCompareMediaErrors({});
    selectActiveJobVariation(nextJob);
    if ((nextJob.kind === "encode" || nextJob.kind === "mux") && nextJob.status === "completed") {
      setActiveView("compare");
    }
  }

  return {
    apiBaseUrl,
    navigation: {
      activeTab,
      activeView,
      setActiveTab,
      setActiveView,
      startNewVideo,
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
      theme
    },
    status: { capabilities, currentStatus, error, importStatus, isUploading },
    library: {
      history,
      selectedVideoIds,
      selectedJobIds,
      setSelectedVideoIds,
      setSelectedJobIds,
      refreshHistory,
      loadHistoryVideo,
      deleteHistoryItems,
      toggleSelected
    },
    source: {
      video,
      sourceUrl,
      sourceDownloadUrl,
      sourceNameDraft,
      setSourceNameDraft,
      renamingSource,
      renameSource,
      uploadFile,
      videoUrl,
      setVideoUrl,
      importVideoUrl,
      sourcePreviewRef,
      posterTimestamp,
      setPosterTimestamp,
      useCurrentPreviewFrame,
      startPosterJob,
      startSubtitleJob
    },
    jobs: {
      job,
      sampleJob,
      posterJob,
      packageJob,
      subtitleJob,
      muxJob,
      currentVideoJobs,
      runningJobs,
      finishedOutputJobs,
      completedOutputJobs,
      completedEncodeJobs,
      bestSavingsJob,
      jobNameDrafts,
      setJobNameDrafts,
      renamingJobId,
      startJob,
      startSampleJob,
      startPosterJob,
      startSubtitleJob,
      startPairJobs,
      optimizeForWebsite,
      cancelJob,
      renameJobOutput,
      selectVariation,
      revealJobOutput,
      deleteHistoryItems,
      muxSubtitlesIntoVideo,
      openSubtitleEditor
    },
    custom: {
      settings,
      setSettings,
      activePreset,
      presets,
      presetInfo,
      estimate,
      recommendations,
      applyPreset,
      updateOutputContainer,
      updateVideoCodec,
      applyTargetSize,
      startJob,
      startSampleJob,
      startPairJobs
    },
    packagePanel: {
      hasModernExport,
      hasFallbackExport,
      hasPoster,
      hasCaptions,
      packageCandidateJobs,
      selectedPackageJobIds,
      setSelectedPackageJobIds,
      packageJobIds,
      selectedPackageJobs,
      packagePreviewSize,
      packageSavings,
      packageMetadata,
      setPackageMetadata,
      packageMetadataReady,
      togglePackageJob,
      createWebPackage
    },
    poster: {
      activePosterPreview,
      activePosterUrl,
      posterUrl,
      posterZoom,
      posterPan,
      closePosterLightbox,
      openPosterLightbox,
      updatePosterZoom,
      startPosterPan,
      movePosterPan,
      stopPosterPan
    },
    captions: {
      editingSubtitleJob,
      subtitleDraft,
      setSubtitleDraft,
      subtitlePreviewKey,
      isSavingSubtitles,
      saveSubtitleEdits,
      setActiveView
    },
    compare: {
      outputUrl,
      downloadUrl,
      videoMarkup,
      completedReduction,
      syncPlayback,
      setSyncPlayback,
      compareMediaErrors,
      setCompareMediaErrors,
      originalCompareRef,
      optimizedCompareRef,
      syncVideoState
    }
  };
}

export type VideoOptimizerAppController = ReturnType<typeof useVideoOptimizerApp>;
