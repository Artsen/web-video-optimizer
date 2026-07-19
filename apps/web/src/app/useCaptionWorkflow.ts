import React from "react";
import type { JobDto } from "@local-video-optimizer/contracts";
import type { AppDependencies } from "./app-dependencies";
import { getReadableApiError } from "../api/api-error";

type Job = JobDto;

export function useCaptionWorkflow({
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
}: {
  api: AppDependencies["api"];
  editingSubtitleJob: Job | null;
  refreshHistory: () => Promise<void>;
  setActiveJobRole: (role: "subtitle", job: Job) => void;
  setActiveView: (view: "prepare" | "results" | "custom" | "compare" | "captions", outputId?: string) => void;
  setEditingSubtitleJob: React.Dispatch<React.SetStateAction<Job | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSavingSubtitles: React.Dispatch<React.SetStateAction<boolean>>;
  setSubtitleDraft: React.Dispatch<React.SetStateAction<string>>;
  setSubtitlePreviewKey: React.Dispatch<React.SetStateAction<number>>;
  subtitleDraft: string;
}) {
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
      setActiveJobRole("subtitle", updated);
      setEditingSubtitleJob(updated);
      setSubtitlePreviewKey((current) => current + 1);
      void refreshHistory();
    } catch (captionError) {
      setError(getReadableApiError(captionError));
    } finally {
      setIsSavingSubtitles(false);
    }
  }

  return { openSubtitleEditor, saveSubtitleEdits };
}
