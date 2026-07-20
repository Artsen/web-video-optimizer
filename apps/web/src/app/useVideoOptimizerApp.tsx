import React from "react";
import type { AppDependencies } from "./app-dependencies";
import { getReadableApiError } from "../api/api-error";
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
import { useBrowserRoute } from "./useBrowserRoute";
import { initialSettings } from "./app-config";
import { buildAppRoute, type AppRoute } from "./routes";
import type {
  Capabilities,
  HistorySnapshot,
  JobDto,
  PackageMetadata,
  StorageStatusDto,
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
  const [activeView, setActiveViewState] = React.useState<"prepare" | "results" | "custom" | "compare" | "captions">(
    "prepare"
  );
  const browserRoute = useBrowserRoute();
  const [isBootstrapped, setIsBootstrapped] = React.useState(false);
  const [missingSourceId, setMissingSourceId] = React.useState<string | null>(null);
  const [selectedOutputId, setSelectedOutputIdState] = React.useState<string | null>(null);
  const [pendingResultsSourceId, setPendingResultsSourceId] = React.useState<string | null>(null);
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
  const [storageStatus, setStorageStatus] = React.useState<StorageStatusDto | null>(null);
  const [compareAllRequested, setCompareAllRequested] = React.useState(false);
  const [storageCleanupStatus, setStorageCleanupStatus] = React.useState("");
  const [isCleaningStorage, setIsCleaningStorage] = React.useState(false);
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
    audioSource,
    selectAudioSource,
    currentTime: compareCurrentTime,
    duration: compareDuration,
    playing: comparePlaying,
    playbackRate: comparePlaybackRate,
    loop: compareLoop,
    registerCompareVideo,
    syncVideoState,
    seekAll,
    playAll,
    pauseAll,
    setAllPlaybackRate,
    setAllLoop
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

  React.useEffect(() => {
    let title = "Web Video Optimizer";
    if (missingSourceId) title = "Source not found - Web Video Optimizer";
    else if (activeTab === "history") title = "Library - Web Video Optimizer";
    else if (video) {
      const viewLabel =
        activeView === "results"
          ? "Results"
          : activeView === "compare"
            ? "Compare"
            : activeView === "custom"
              ? "Custom Export"
              : activeView === "captions"
                ? "Caption Editor"
                : "Prepare";
      title = `${viewLabel}: ${video.originalName} - Web Video Optimizer`;
    }
    document.title = title;
  }, [activeTab, activeView, missingSourceId, video]);

  const { bootstrap, retryBootstrap } = useAppBootstrap({
    api,
    theme,
    setCapabilities,
    setHistory,
    setReady: setIsBootstrapped,
    setStorageStatus
  });

  const applyRouteState = React.useCallback((route: AppRoute) => {
    setMissingSourceId(null);
    if (route.view === "library") {
      setActiveTab("history");
      setActiveViewState("prepare");
      return;
    }
    setActiveTab("workflow");
    if (route.view === "new") {
      setActiveViewState("prepare");
      return;
    }
    setActiveViewState(route.view);
    setSelectedOutputIdState(route.outputId ?? null);
  }, []);

  const setActiveView = React.useCallback(
    (nextView: "prepare" | "results" | "custom" | "compare" | "captions", outputId?: string) => {
      if (nextView === "captions") {
        setActiveTab("workflow");
        setActiveViewState("captions");
        return;
      }
      if (!video) {
        const route: AppRoute = { view: "new" };
        browserRoute.navigate(route);
        applyRouteState(route);
        return;
      }
      const route: AppRoute =
        nextView === "compare"
          ? {
              view: "compare",
              sourceId: video.id,
              outputId,
              compareMode: "grid",
              compareLayout: "auto"
            }
          : { view: nextView, sourceId: video.id, outputId };
      browserRoute.navigate(route);
      applyRouteState(route);
    },
    [applyRouteState, browserRoute, video]
  );

  const replaceActiveViewRoute = React.useCallback(
    (nextRoute: AppRoute) => {
      browserRoute.replace(nextRoute);
      applyRouteState(nextRoute);
    },
    [applyRouteState, browserRoute]
  );

  const openNewRoute = React.useCallback(() => {
    const route: AppRoute = { view: "new" };
    browserRoute.navigate(route);
    applyRouteState(route);
  }, [applyRouteState, browserRoute]);

  const openLibraryRoute = React.useCallback(() => {
    const route: AppRoute = { view: "library" };
    browserRoute.navigate(route);
    applyRouteState(route);
  }, [applyRouteState, browserRoute]);

  const openRouteForSource = React.useCallback(
    (record: VideoRecord, requestedView?: "prepare" | "results" | "custom" | "compare") => {
      const hasOutputs = history.jobs.some(
        (historyJob) =>
          historyJob.videoId === record.id &&
          historyJob.status === "completed" &&
          ["encode", "mux", "poster", "subtitle", "package"].includes(historyJob.kind)
      );
      const view = requestedView ?? (hasOutputs ? "results" : "prepare");
      const route: AppRoute =
        view === "compare"
          ? { view, sourceId: record.id, compareMode: "grid", compareLayout: "auto" }
          : { view, sourceId: record.id };
      browserRoute.navigate(route);
      applyRouteState(route);
    },
    [applyRouteState, browserRoute, history.jobs]
  );

  const setSelectedOutputId = React.useCallback(
    (jobId: string | null) => {
      setSelectedOutputIdState(jobId);
      if (video && activeTab === "workflow" && activeView === "results") {
        replaceActiveViewRoute({ view: "results", sourceId: video.id, outputId: jobId ?? undefined });
      }
    },
    [activeTab, activeView, replaceActiveViewRoute, video]
  );

  React.useEffect(() => {
    if (video && activeView === "results" && finishedOutputJobs.length === 0 && isBootstrapped) {
      queueMicrotask(() => replaceActiveViewRoute({ view: "prepare", sourceId: video.id }));
      return;
    }
    if (!video || activeView !== "results") return;
    if (finishedOutputJobs.length === 0) {
      if (selectedOutputId) queueMicrotask(() => setSelectedOutputIdState(null));
      return;
    }
    const selectedExists = selectedOutputId
      ? finishedOutputJobs.some((output) => output.id === selectedOutputId)
      : false;
    if (!selectedExists) {
      const nextOutputId = finishedOutputJobs[0]?.id ?? null;
      queueMicrotask(() => {
        setSelectedOutputIdState(nextOutputId);
        replaceActiveViewRoute({ view: "results", sourceId: video.id, outputId: nextOutputId ?? undefined });
      });
    }
  }, [
    activeView,
    currentVideoJobs.length,
    finishedOutputJobs,
    isBootstrapped,
    replaceActiveViewRoute,
    selectedOutputId,
    video
  ]);

  React.useEffect(() => {
    if (!video || pendingResultsSourceId !== video.id || completedOutputJobs.length === 0) return;
    const firstOutputId = completedOutputJobs[0]?.id;
    queueMicrotask(() => {
      setPendingResultsSourceId(null);
      setActiveView("results", firstOutputId);
    });
  }, [completedOutputJobs, pendingResultsSourceId, setActiveView, video]);

  const refreshStorageStatus = React.useCallback(async () => {
    try {
      setStorageStatus(await api.getStorageStatus());
    } catch {
      return;
    }
  }, [api]);

  const refreshHistory = React.useCallback(async () => {
    try {
      setHistory(await api.getHistory());
      void refreshStorageStatus();
    } catch {
      return;
    }
  }, [api, refreshStorageStatus]);

  async function cleanupStorage() {
    setIsCleaningStorage(true);
    setStorageCleanupStatus("");
    try {
      const result = await api.cleanupStorage();
      setStorageStatus(result.storage);
      setStorageCleanupStatus(`Reclaimed ${result.removedFileCount} temporary file(s).`);
    } catch (cleanupError) {
      setError(getReadableApiError(cleanupError));
    } finally {
      setIsCleaningStorage(false);
    }
  }

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
  const closeJobSubscriptions = jobSubscriptions.closeAll;

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
      openNewRoute,
      openRouteForSource,
      sourceNameDraft,
      video,
      videoUrl,
      sourcePreviewRef,
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
      closeJobSubscriptions,
      closePosterLightbox,
      refreshHistory,
      resetActiveJobs,
      restoreActiveJobsFromHistory
    });
  const loadHistoryVideoRef = React.useRef(loadHistoryVideo);
  React.useEffect(() => {
    loadHistoryVideoRef.current = loadHistoryVideo;
  }, [loadHistoryVideo]);

  React.useEffect(() => {
    const route = browserRoute.route;
    if (!isBootstrapped) return;
    let canceled = false;
    const syncRouteState = (callback: () => void) => {
      queueMicrotask(() => {
        if (!canceled) callback();
      });
    };

    if (route.view === "library") {
      syncRouteState(() => applyRouteState(route));
      return () => {
        canceled = true;
      };
    }

    if (route.view === "new") {
      syncRouteState(() => {
        if (video) {
          setVideo(null);
          setCompareMediaErrors({});
          closeJobSubscriptions();
          resetActiveJobs();
          closePosterLightbox();
          setSubtitleDraft("");
          setSourceNameDraft("");
          setPosterTimestamp(0);
          setSelectedPackageJobIds([]);
          setPackageMetadata({ title: "", description: "", language: "en", filenamePrefix: "" });
          setSettings(initialSettings);
          setError(null);
          setImportStatus("");
          setVideoUrl("");
        }
        applyRouteState(route);
      });
      return () => {
        canceled = true;
      };
    }

    const requestedView = route.view;
    const requestedOutputId = route.outputId;
    if (video?.id === route.sourceId) {
      syncRouteState(() => {
        setMissingSourceId(null);
        applyRouteState(route);
      });
      return () => {
        canceled = true;
      };
    }

    const historyVideo = history.videos.find((candidate) => candidate.id === route.sourceId);
    if (historyVideo) {
      syncRouteState(() => {
        loadHistoryVideoRef.current(historyVideo, requestedView, false);
        setMissingSourceId(null);
        applyRouteState(route);
        setSelectedOutputIdState(requestedOutputId ?? null);
      });
      return () => {
        canceled = true;
      };
    }

    syncRouteState(() => {
      setVideo(null);
      resetActiveJobs();
      closePosterLightbox();
      setMissingSourceId(route.sourceId);
      setActiveTab("workflow");
      setActiveViewState("prepare");
      window.history.replaceState(null, "", buildAppRoute({ view: "library" }));
    });
    return () => {
      canceled = true;
    };
  }, [
    applyRouteState,
    browserRoute.route,
    closePosterLightbox,
    closeJobSubscriptions,
    history.videos,
    isBootstrapped,
    resetActiveJobs,
    setCompareMediaErrors,
    setSettings,
    video
  ]);
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
    setError,
    setHistory,
    requestResultsReveal: setPendingResultsSourceId,
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
    } catch (deleteError) {
      setError(getReadableApiError(deleteError));
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
    setCompareAllRequested(false);
    selectActiveJobVariation(nextJob);
    if ((nextJob.kind === "encode" || nextJob.kind === "mux") && nextJob.status === "completed") {
      setActiveView("compare", nextJob.id);
    }
  }

  function compareAllVersions() {
    setCompareMediaErrors({});
    setCompareAllRequested(true);
    setActiveView("compare");
  }

  return {
    apiBaseUrl,
    navigation: {
      activeTab,
      activeView,
      route: browserRoute.route,
      isBootstrapped,
      missingSourceId,
      bootstrap,
      openLibraryRoute,
      openNewRoute,
      openRouteForSource,
      replaceActiveViewRoute,
      setActiveTab,
      setActiveView,
      startNewVideo,
      retryBootstrap,
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
      theme
    },
    status: { capabilities, currentStatus, error, importStatus, isUploading },
    library: {
      history,
      selectedVideoIds,
      selectedJobIds,
      storageStatus,
      storageCleanupStatus,
      isCleaningStorage,
      setSelectedVideoIds,
      setSelectedJobIds,
      refreshHistory,
      refreshStorageStatus,
      cleanupStorage,
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
      selectedOutputId,
      setSelectedOutputId,
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
      compareAllVersions,
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
      compareAllRequested,
      syncPlayback,
      setSyncPlayback,
      compareMediaErrors,
      setCompareMediaErrors,
      audioSource,
      selectAudioSource,
      compareCurrentTime,
      compareDuration,
      comparePlaying,
      comparePlaybackRate,
      compareLoop,
      registerCompareVideo,
      syncVideoState,
      seekAll,
      playAll,
      pauseAll,
      setAllPlaybackRate,
      setAllLoop
    }
  };
}

export type VideoOptimizerAppController = ReturnType<typeof useVideoOptimizerApp>;
