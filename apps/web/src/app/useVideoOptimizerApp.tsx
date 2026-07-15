import React from "react";
import {
  buildRecommendations,
  estimateOutputSize,
  normalizeOutputContainerChange,
  normalizeVideoCodecChange
} from "../video-ui";
import type { AppDependencies } from "./app-dependencies";
import { initialSettings, presetInfo, presets, type Settings } from "./app-config";
import { getReadableApiError } from "../api/api-error";
import { slugify } from "../domain/formatters";
import { buildVideoMarkup } from "../domain/job-presenters";
import { jobDownloadUrl, jobOutputUrl, videoDownloadUrl, videoSourceUrl } from "../api/urls";
import { useSynchronizedPlayback } from "../features/compare/use-synchronized-playback";
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
import type {
  Capabilities,
  HistorySnapshot,
  HistoryVideo,
  JobDto,
  PackageMetadata,
  VideoRecordDto
} from "@local-video-optimizer/contracts";

type VideoRecord = VideoRecordDto;
type Job = JobDto;
type JobSubscription = { close(): void };

export function useVideoOptimizerApp(dependencies: AppDependencies) {
  const { api, apiBaseUrl, jobEvents } = dependencies;
  const [video, setVideo] = React.useState<VideoRecord | null>(null);
  const [settings, setSettings] = React.useState<Settings>(initialSettings);
  const [job, setJob] = React.useState<Job | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [videoUrl, setVideoUrl] = React.useState("");
  const [importStatus, setImportStatus] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  const [activePreset, setActivePreset] = React.useState("Maximum Compatibility");
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
  const [posterJob, setPosterJob] = React.useState<Job | null>(null);
  const [sampleJob, setSampleJob] = React.useState<Job | null>(null);
  const [packageJob, setPackageJob] = React.useState<Job | null>(null);
  const [subtitleJob, setSubtitleJob] = React.useState<Job | null>(null);
  const [muxJob, setMuxJob] = React.useState<Job | null>(null);
  const [activePosterPreview, setActivePosterPreview] = React.useState<Job | null>(null);
  const [posterZoom, setPosterZoom] = React.useState(1);
  const [posterPan, setPosterPan] = React.useState({ x: 0, y: 0 });
  const [posterDragStart, setPosterDragStart] = React.useState<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const [editingSubtitleJob, setEditingSubtitleJob] = React.useState<Job | null>(null);
  const [subtitleDraft, setSubtitleDraft] = React.useState("");
  const [subtitlePreviewKey, setSubtitlePreviewKey] = React.useState(0);
  const [isSavingSubtitles, setIsSavingSubtitles] = React.useState(false);
  const [capabilities, setCapabilities] = React.useState<Capabilities | null>(null);
  const [posterTimestamp, setPosterTimestamp] = React.useState(0);
  const sourcePreviewRef = React.useRef<HTMLVideoElement | null>(null);
  const jobSubscriptionsRef = React.useRef(new Map<string, JobSubscription>());
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
  const estimate = video ? estimateOutputSize(video.metadata, settings) : undefined;
  const recommendations = video ? buildRecommendations(video.metadata, settings, estimate) : [];
  const videoMarkup = job ? buildVideoMarkup(job, job.settings) : "";
  const completedReduction =
    video && job?.outputSize ? Math.round((1 - job.outputSize / video.metadata.fileSize) * 100) : undefined;
  const currentVideoJobs = React.useMemo(() => {
    if (!video) return [];
    const byId = new Map<string, Job>(jobsForVideo(history, video.id).map((historyJob) => [historyJob.id, historyJob]));
    for (const liveJob of [job, sampleJob, posterJob, packageJob, subtitleJob, muxJob]) {
      if (liveJob?.videoId === video.id) byId.set(liveJob.id, liveJob);
    }
    return Array.from(byId.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [history, job, muxJob, packageJob, posterJob, sampleJob, subtitleJob, video]);
  const completedEncodeJobs = selectCompletedOutputJobs(currentVideoJobs).filter(
    (historyJob) => historyJob.kind === "encode" || historyJob.kind === "mux"
  );
  const hasModernExport = hasModernOutput(currentVideoJobs);
  const hasFallbackExport = hasFallbackOutput(currentVideoJobs);
  const hasPoster = posterJob?.status === "completed" || hasCompletedPoster(currentVideoJobs);
  const hasCaptions = subtitleJob?.status === "completed" || hasCompletedCaptions(currentVideoJobs);
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
      : packageJob?.status === "completed"
        ? "Package ready"
        : completedOutputJobs.length > 0
          ? "Outputs ready"
          : video
            ? "Ready"
            : "No video";

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  React.useEffect(() => {
    if (!activePosterPreview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePosterLightbox();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePosterPreview]);

  const refreshHistory = React.useCallback(async () => {
    try {
      setHistory(await api.getHistory());
    } catch {
      return;
    }
  }, [api]);

  React.useEffect(() => {
    void api
      .getHistory()
      .then(setHistory)
      .catch(() => undefined);
    void api
      .getCapabilities()
      .then(setCapabilities)
      .catch(() => undefined);
  }, [api]);

  React.useEffect(() => {
    const subscriptions = jobSubscriptionsRef.current;
    return () => {
      for (const subscription of subscriptions.values()) {
        subscription.close();
      }
      subscriptions.clear();
    };
  }, []);

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

  function loadVideoRecord(record: VideoRecord) {
    setVideo(record);
    setCompareMediaErrors({});
    setSourceNameDraft(record.originalName);
    setActiveTab("workflow");
    setActiveView("prepare");
    setSettings((current) => ({
      ...current,
      outputFilename: `${record.originalName.replace(/\.[^.]+$/, "")}-optimized`
    }));
    setPackageMetadata({
      title: record.originalName.replace(/\.[^.]+$/, ""),
      description: `Video for ${record.originalName.replace(/\.[^.]+$/, "")}.`,
      language: "en",
      filenamePrefix: slugify(record.originalName.replace(/\.[^.]+$/, ""))
    });
  }

  function watchJob(nextJob: Job, onUpdate?: (updated: Job) => void) {
    jobSubscriptionsRef.current.get(nextJob.id)?.close();
    const subscription = jobEvents.subscribe(nextJob.id, {
      onUpdate(updated) {
        mergeHistoryJob(updated);
        onUpdate?.(updated);
        setJob((current) => (current?.id === updated.id ? updated : current));
        setSampleJob((current) => (current?.id === updated.id ? updated : current));
        setPosterJob((current) => (current?.id === updated.id ? updated : current));
        setPackageJob((current) => (current?.id === updated.id ? updated : current));
        setSubtitleJob((current) => (current?.id === updated.id ? updated : current));
        setMuxJob((current) => (current?.id === updated.id ? updated : current));
        setEditingSubtitleJob((current) => (current?.id === updated.id ? updated : current));
        if (updated.status === "completed" || updated.status === "failed" || updated.status === "canceled") {
          jobSubscriptionsRef.current.get(updated.id)?.close();
          jobSubscriptionsRef.current.delete(updated.id);
          void refreshHistory();
        }
      },
      onError() {
        jobSubscriptionsRef.current.get(nextJob.id)?.close();
        jobSubscriptionsRef.current.delete(nextJob.id);
        void refreshHistory();
      }
    });
    jobSubscriptionsRef.current.set(nextJob.id, subscription);
  }

  async function uploadFile(file: File) {
    setIsUploading(true);
    setImportStatus("Analyzing local file with FFprobe...");
    setError(null);
    setJob(null);
    setPosterJob(null);
    setSampleJob(null);
    setPackageJob(null);
    setSubtitleJob(null);
    setMuxJob(null);
    setEditingSubtitleJob(null);
    setSubtitleDraft("");
    setPosterTimestamp(0);

    try {
      const record = await api.uploadVideo(file);
      loadVideoRecord(record);
      void refreshHistory();
    } catch (uploadError) {
      setError(getReadableApiError(uploadError));
    } finally {
      setIsUploading(false);
      setImportStatus("");
    }
  }

  function mergeHistoryVideo(updated: VideoRecord) {
    setHistory((current) => ({
      ...current,
      videos: current.videos.map((historyVideo) =>
        historyVideo.id === updated.id ? { ...historyVideo, ...updated, jobIds: historyVideo.jobIds } : historyVideo
      )
    }));
  }

  async function renameSource() {
    if (!video || !sourceNameDraft.trim()) return;
    setRenamingSource(true);
    setError(null);
    try {
      const updated = await api.renameVideo(video.id, sourceNameDraft.trim());
      setVideo(updated);
      setSourceNameDraft(updated.originalName);
      mergeHistoryVideo(updated);
      void refreshHistory();
    } catch (renameError) {
      setError(getReadableApiError(renameError));
    } finally {
      setRenamingSource(false);
    }
  }

  async function renameJobOutput(target: Job) {
    const nextName = (jobNameDrafts[target.id] ?? target.outputFileName ?? "").trim();
    if (!nextName) return;
    setRenamingJobId(target.id);
    setError(null);
    try {
      const updated = await api.renameJob(target.id, nextName);
      mergeHistoryJob(updated);
      if (updated.id === job?.id) setJob(updated);
      if (updated.id === sampleJob?.id) setSampleJob(updated);
      if (updated.id === posterJob?.id) setPosterJob(updated);
      if (updated.id === packageJob?.id) setPackageJob(updated);
      if (updated.id === subtitleJob?.id) setSubtitleJob(updated);
      if (updated.id === muxJob?.id) setMuxJob(updated);
      if (updated.id === editingSubtitleJob?.id) setEditingSubtitleJob(updated);
      setJobNameDrafts((current) => ({ ...current, [updated.id]: updated.outputFileName ?? nextName }));
      void refreshHistory();
    } catch (renameError) {
      setError(getReadableApiError(renameError));
    } finally {
      setRenamingJobId(null);
    }
  }

  async function importVideoUrl() {
    if (!videoUrl.trim()) return;
    setIsUploading(true);
    setImportStatus("Downloading with yt-dlp. This can take a minute for longer videos...");
    setError(null);
    setJob(null);
    setPosterJob(null);
    setSampleJob(null);
    setPackageJob(null);
    setSubtitleJob(null);
    setMuxJob(null);
    setPosterTimestamp(0);

    try {
      const record = await api.importVideoUrl(videoUrl.trim());
      setImportStatus("Download complete. Analyzing with FFprobe...");
      loadVideoRecord(record);
      setVideoUrl("");
      void refreshHistory();
    } catch (uploadError) {
      setError(getReadableApiError(uploadError));
    } finally {
      setIsUploading(false);
      setImportStatus("");
    }
  }

  function startNewVideo() {
    setVideo(null);
    setCompareMediaErrors({});
    setJob(null);
    setSampleJob(null);
    setPosterJob(null);
    setPackageJob(null);
    setSubtitleJob(null);
    setMuxJob(null);
    setEditingSubtitleJob(null);
    setActivePosterPreview(null);
    setSubtitleDraft("");
    setSourceNameDraft("");
    setPosterTimestamp(0);
    setSelectedPackageJobIds([]);
    setPackageMetadata({ title: "", description: "", language: "en", filenamePrefix: "" });
    setSettings(initialSettings);
    setError(null);
    setImportStatus("");
    setVideoUrl("");
    setActiveTab("workflow");
    setActiveView("prepare");
  }

  async function startJob() {
    if (!video) return;
    setError(null);
    try {
      const nextJob = await api.createOptimizationJob(video.id, settings);
      setJob(nextJob);
      setActiveView("outputs");
      watchJob(nextJob, setJob);
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
      setSampleJob(nextJob);
      setActiveView("outputs");
      watchJob(nextJob, setSampleJob);
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
      setPosterJob(nextJob);
      setActiveView("outputs");
      watchJob(nextJob, setPosterJob);
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
      setSubtitleJob(nextJob);
      setActiveView("outputs");
      watchJob(nextJob, setSubtitleJob);
      void refreshHistory();
    } catch (jobError) {
      setError(getReadableApiError(jobError));
    }
  }

  function useCurrentPreviewFrame() {
    const currentTime = sourcePreviewRef.current?.currentTime ?? 0;
    setPosterTimestamp(Math.round(currentTime * 10) / 10);
  }

  async function startPairJobs() {
    if (!video) return;
    setError(null);
    try {
      const payload = await api.createPairJobs(video.id, settings);
      const primary = payload.jobs[0];
      if (primary) setJob(primary);
      setActiveView("outputs");
      payload.jobs.forEach((nextJob) => watchJob(nextJob, primary?.id === nextJob.id ? setJob : undefined));
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
      if (target.id === job?.id) setJob(null);
      if (target.id === sampleJob?.id) setSampleJob(null);
      if (target.id === posterJob?.id) setPosterJob(null);
      if (target.id === packageJob?.id) setPackageJob(null);
      if (target.id === subtitleJob?.id) setSubtitleJob(null);
      if (target.id === muxJob?.id) setMuxJob(null);
      void refreshHistory();
      return;
    }
    if (target.id === job?.id) setJob(updated);
    if (target.id === sampleJob?.id) setSampleJob(updated);
    if (target.id === posterJob?.id) setPosterJob(updated);
    if (target.id === packageJob?.id) setPackageJob(updated);
    if (target.id === subtitleJob?.id) setSubtitleJob(updated);
    if (target.id === muxJob?.id) setMuxJob(updated);
    void refreshHistory();
  }

  async function createWebPackage() {
    if (!video) return;
    setError(null);
    if (packageJobIds.length === 0) {
      setError("Create at least one completed export or poster before building a package.");
      return;
    }
    if (!packageMetadataReady) {
      setError("Add a video title, SEO description, language, and filename prefix before building the package.");
      return;
    }

    try {
      const nextJob = await api.createPackageJob(video.id, Array.from(new Set(packageJobIds)), packageMetadata);
      setPackageJob(nextJob);
      setActiveView("outputs");
      void refreshHistory();
    } catch (packageError) {
      setError(getReadableApiError(packageError));
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
      setJob(null);
      setSampleJob(null);
      setPosterJob(null);
      setPackageJob(null);
      setSubtitleJob(null);
      setMuxJob(null);
      setEditingSubtitleJob(null);
      closePosterLightbox();
    }
    if (jobIds.includes(job?.id ?? "")) {
      setJob(null);
    }
    if (jobIds.includes(sampleJob?.id ?? "")) {
      setSampleJob(null);
    }
    if (jobIds.includes(posterJob?.id ?? "")) {
      setPosterJob(null);
    }
    if (jobIds.includes(packageJob?.id ?? "")) {
      setPackageJob(null);
    }
    if (jobIds.includes(subtitleJob?.id ?? "")) {
      setSubtitleJob(null);
    }
    if (jobIds.includes(muxJob?.id ?? "")) {
      setMuxJob(null);
    }
    if (jobIds.includes(activePosterPreview?.id ?? "")) {
      closePosterLightbox();
    }
    if (jobIds.includes(editingSubtitleJob?.id ?? "")) {
      setEditingSubtitleJob(null);
      setSubtitleDraft("");
    }
  }

  function applyPreset(name: string) {
    setActivePreset(name);
    setSettings((current) => ({ ...current, ...presets[name] }));
  }

  function updateOutputContainer(outputContainer: Settings["outputContainer"]) {
    setSettings((current) => {
      const next = normalizeOutputContainerChange(current, outputContainer);
      return { ...next, outputFilename: next.outputFilename ?? current.outputFilename };
    });
  }

  function updateVideoCodec(videoCodec: Settings["videoCodec"]) {
    setSettings((current) => {
      const next = normalizeVideoCodecChange(current, videoCodec);
      return { ...next, outputFilename: next.outputFilename ?? current.outputFilename };
    });
  }

  function applyTargetSize(targetMb: number) {
    if (!video?.metadata.durationSeconds) return;
    const targetBitsPerSecond = (targetMb * 1024 * 1024 * 8) / video.metadata.durationSeconds;
    const hasAudio = video.metadata.trackCounts.audio > 0;
    const targetVideoBits = targetBitsPerSecond - (hasAudio ? 96_000 : 0);
    const aggressive = targetMb <= 2 || targetVideoBits < 800_000;
    const balanced = targetMb <= 5 || targetVideoBits < 1_600_000;

    setSettings((current) => ({
      ...current,
      width: aggressive ? 854 : balanced ? 1280 : Math.min(video.metadata.width ?? 1920, 1920),
      frameRate: aggressive || (video.metadata.frameRate ?? 0) > 30 ? 24 : current.frameRate,
      crf:
        current.videoCodec === "libx264"
          ? aggressive
            ? 30
            : balanced
              ? 27
              : 24
          : aggressive
            ? 38
            : balanced
              ? 34
              : 30,
      audioMode: hasAudio ? "compress" : "remove",
      audioBitrateKbps: aggressive ? 64 : balanced ? 96 : 128
    }));
  }

  function loadHistoryVideo(historyVideo: HistoryVideo) {
    setVideo(historyVideo);
    setCompareMediaErrors({});
    setSourceNameDraft(historyVideo.originalName);
    const latestEncode = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "encode"
    );
    const latestPoster = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "poster"
    );
    const latestSample = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "sample"
    );
    const latestPackage = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "package"
    );
    const latestSubtitle = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "subtitle"
    );
    const latestMux = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "mux"
    );
    setJob(latestEncode ?? null);
    setPosterJob(latestPoster ?? null);
    setSampleJob(latestSample ?? null);
    setPackageJob(latestPackage ?? null);
    setSubtitleJob(latestSubtitle ?? null);
    setMuxJob(latestMux ?? null);
    setEditingSubtitleJob(null);
    setSubtitleDraft("");
    if (latestEncode?.settings) setSettings((current) => ({ ...current, ...latestEncode.settings }));
    setPackageMetadata({
      title: historyVideo.originalName.replace(/\.[^.]+$/, ""),
      description: `Video for ${historyVideo.originalName.replace(/\.[^.]+$/, "")}.`,
      language: "en",
      filenamePrefix: slugify(historyVideo.originalName.replace(/\.[^.]+$/, ""))
    });
    setActiveTab("workflow");
    setActiveView("prepare");
  }

  function toggleSelected(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function selectVariation(nextJob: Job) {
    setCompareMediaErrors({});
    if (nextJob.kind === "encode") setJob(nextJob);
    if (nextJob.kind === "sample") setSampleJob(nextJob);
    if (nextJob.kind === "poster") setPosterJob(nextJob);
    if (nextJob.kind === "package") setPackageJob(nextJob);
    if (nextJob.kind === "subtitle") setSubtitleJob(nextJob);
    if (nextJob.kind === "mux") setMuxJob(nextJob);
    if ((nextJob.kind === "encode" || nextJob.kind === "mux") && nextJob.status === "completed") {
      setJob(nextJob);
      setActiveView("compare");
    }
  }

  function openPosterLightbox(nextJob: Job) {
    setPosterJob(nextJob);
    setActivePosterPreview(nextJob);
    setPosterZoom(1);
    setPosterPan({ x: 0, y: 0 });
    setPosterDragStart(null);
  }

  function closePosterLightbox() {
    setActivePosterPreview(null);
    setPosterZoom(1);
    setPosterPan({ x: 0, y: 0 });
    setPosterDragStart(null);
  }

  function updatePosterZoom(nextZoom: number) {
    const zoom = Math.max(1, Math.min(4, Math.round(nextZoom * 10) / 10));
    setPosterZoom(zoom);
    if (zoom === 1) setPosterPan({ x: 0, y: 0 });
  }

  function startPosterPan(event: React.PointerEvent<HTMLDivElement>) {
    if (posterZoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPosterDragStart({ x: event.clientX, y: event.clientY, panX: posterPan.x, panY: posterPan.y });
  }

  function movePosterPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!posterDragStart || posterZoom <= 1) return;
    setPosterPan({
      x: posterDragStart.panX + event.clientX - posterDragStart.x,
      y: posterDragStart.panY + event.clientY - posterDragStart.y
    });
  }

  function stopPosterPan() {
    setPosterDragStart(null);
  }

  function togglePackageJob(jobId: string) {
    const candidateIds = packageCandidateJobs.map((historyJob) => historyJob.id);
    setSelectedPackageJobIds((current) => {
      const active = current.length === 0 ? candidateIds : current;
      return active.includes(jobId) ? active.filter((id) => id !== jobId) : [...active, jobId];
    });
  }

  async function revealJobOutput(target: Job) {
    try {
      await api.revealJob(target.id);
    } catch (revealError) {
      setError(getReadableApiError(revealError));
    }
  }

  async function openSubtitleEditor(target: Job) {
    setError(null);
    try {
      const payload = await api.getCaptions(target.id);
      setEditingSubtitleJob(target);
      setSubtitleDraft(payload.vtt);
      setActiveView("captions");
    } catch (captionError) {
      setError(getReadableApiError(captionError));
    }
  }

  async function saveSubtitleEdits() {
    if (!editingSubtitleJob) return;
    setError(null);
    setIsSavingSubtitles(true);
    try {
      const updated = await api.updateCaptions(editingSubtitleJob.id, subtitleDraft);
      setSubtitleJob(updated);
      setEditingSubtitleJob(updated);
      setSubtitlePreviewKey((current) => current + 1);
      void refreshHistory();
    } catch (captionError) {
      setError(getReadableApiError(captionError));
    } finally {
      setIsSavingSubtitles(false);
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
      setMuxJob(nextJob);
      setActiveView("outputs");
      watchJob(nextJob, setMuxJob);
      void refreshHistory();
    } catch (muxError) {
      setError(getReadableApiError(muxError));
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
