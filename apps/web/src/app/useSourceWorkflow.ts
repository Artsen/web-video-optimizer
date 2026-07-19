import React from "react";
import type { HistorySnapshot, HistoryVideo, PackageMetadata, VideoRecordDto } from "@local-video-optimizer/contracts";
import type { AppDependencies } from "./app-dependencies";
import type { Settings } from "./app-config";
import { initialSettings } from "./app-config";
import { getReadableApiError } from "../api/api-error";
import { slugify } from "../domain/formatters";

type VideoRecord = VideoRecordDto;

function sourcePackageMetadata(fileName: string): PackageMetadata {
  const title = fileName.replace(/\.[^.]+$/, "");
  return {
    title,
    description: `Video for ${title}.`,
    language: "en",
    filenamePrefix: slugify(title)
  };
}

export function useSourceWorkflow({
  api,
  history,
  sourceNameDraft,
  video,
  videoUrl,
  sourcePreviewRef,
  openRouteForSource,
  openNewRoute,
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
}: {
  api: AppDependencies["api"];
  history: HistorySnapshot;
  sourceNameDraft: string;
  video: VideoRecord | null;
  videoUrl: string;
  sourcePreviewRef: React.RefObject<HTMLVideoElement | null>;
  openRouteForSource: (record: VideoRecord, requestedView?: "prepare" | "results" | "custom" | "compare") => void;
  openNewRoute: () => void;
  setCompareMediaErrors: React.Dispatch<React.SetStateAction<Record<string, string | undefined>>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setHistory: React.Dispatch<React.SetStateAction<HistorySnapshot>>;
  setImportStatus: React.Dispatch<React.SetStateAction<string>>;
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>;
  setPackageMetadata: React.Dispatch<React.SetStateAction<PackageMetadata>>;
  setPosterTimestamp: React.Dispatch<React.SetStateAction<number>>;
  setSelectedPackageJobIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  setSourceNameDraft: React.Dispatch<React.SetStateAction<string>>;
  setSubtitleDraft: React.Dispatch<React.SetStateAction<string>>;
  setVideo: React.Dispatch<React.SetStateAction<VideoRecord | null>>;
  setVideoUrl: React.Dispatch<React.SetStateAction<string>>;
  renamingSource: boolean;
  setRenamingSource: React.Dispatch<React.SetStateAction<boolean>>;
  closeJobSubscriptions: () => void;
  closePosterLightbox: () => void;
  refreshHistory: () => Promise<void>;
  resetActiveJobs: () => void;
  restoreActiveJobsFromHistory: (history: HistorySnapshot, videoId: string) => void;
}) {
  function mergeHistoryVideo(updated: VideoRecord) {
    setHistory((current) => ({
      ...current,
      videos: current.videos.map((historyVideo) =>
        historyVideo.id === updated.id ? { ...historyVideo, ...updated, jobIds: historyVideo.jobIds } : historyVideo
      )
    }));
  }

  function loadVideoRecord(
    record: VideoRecord,
    requestedView: "prepare" | "results" | "custom" | "compare" = "prepare",
    syncRoute = true
  ) {
    setVideo(record);
    setCompareMediaErrors({});
    setSourceNameDraft(record.originalName);
    setSettings((current) => ({
      ...current,
      outputFilename: `${record.originalName.replace(/\.[^.]+$/, "")}-optimized`
    }));
    setPackageMetadata(sourcePackageMetadata(record.originalName));
    if (syncRoute) openRouteForSource(record, requestedView);
  }

  async function uploadFile(file: File) {
    setIsUploading(true);
    setImportStatus("Analyzing local file with FFprobe...");
    setError(null);
    closeJobSubscriptions();
    resetActiveJobs();
    setSubtitleDraft("");
    setPosterTimestamp(0);

    try {
      const record = await api.uploadVideo(file);
      loadVideoRecord(record, "prepare");
      void refreshHistory();
    } catch (uploadError) {
      setError(getReadableApiError(uploadError));
    } finally {
      setIsUploading(false);
      setImportStatus("");
    }
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

  async function importVideoUrl() {
    if (!videoUrl.trim()) return;
    setIsUploading(true);
    setImportStatus("Downloading with yt-dlp. This can take a minute for longer videos...");
    setError(null);
    closeJobSubscriptions();
    resetActiveJobs();
    setPosterTimestamp(0);

    try {
      const record = await api.importVideoUrl(videoUrl.trim());
      setImportStatus("Download complete. Analyzing with FFprobe...");
      loadVideoRecord(record, "prepare");
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
    openNewRoute();
  }

  function loadHistoryVideo(
    historyVideo: HistoryVideo,
    requestedView?: "prepare" | "results" | "custom" | "compare",
    syncRoute = true
  ) {
    setVideo(historyVideo);
    setCompareMediaErrors({});
    closeJobSubscriptions();
    setSourceNameDraft(historyVideo.originalName);
    const latestEncode = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "encode"
    );
    restoreActiveJobsFromHistory(history, historyVideo.id);
    setSubtitleDraft("");
    if (latestEncode?.settings) setSettings((current) => ({ ...current, ...latestEncode.settings }));
    setPackageMetadata(sourcePackageMetadata(historyVideo.originalName));
    if (syncRoute) openRouteForSource(historyVideo, requestedView);
  }

  function useCurrentPreviewFrame() {
    const currentTime = sourcePreviewRef.current?.currentTime ?? 0;
    setPosterTimestamp(Math.round(currentTime * 10) / 10);
  }

  return {
    importVideoUrl,
    loadHistoryVideo,
    loadVideoRecord,
    mergeHistoryVideo,
    renameSource,
    renamingSource,
    startNewVideo,
    uploadFile,
    useCurrentPreviewFrame
  };
}
