import React from "react";
import type { HistorySnapshot, JobDto } from "@local-video-optimizer/contracts";
import {
  activeJobsList,
  clearActiveJobsById,
  emptyActiveJobs,
  restoreActiveJobsFromHistory,
  selectActiveJobVariation,
  setActiveJobRole,
  updateActiveJobsById,
  type ActiveJobRole,
  type ActiveJobs
} from "./active-jobs";

export function useActiveJobs() {
  const [activeJobs, setActiveJobs] = React.useState<ActiveJobs>(emptyActiveJobs);
  const [editingSubtitleJob, setEditingSubtitleJob] = React.useState<JobDto | null>(null);

  const setRole = React.useCallback((role: ActiveJobRole, job: JobDto | null) => {
    setActiveJobs((current) => setActiveJobRole(current, role, job));
  }, []);

  const updateById = React.useCallback((updated: JobDto) => {
    setActiveJobs((current) => updateActiveJobsById(current, updated));
    setEditingSubtitleJob((current) => (current?.id === updated.id ? updated : current));
  }, []);

  const clearById = React.useCallback((jobId: string) => {
    setActiveJobs((current) => clearActiveJobsById(current, jobId));
    setEditingSubtitleJob((current) => (current?.id === jobId ? null : current));
  }, []);

  const reset = React.useCallback(() => {
    setActiveJobs(emptyActiveJobs);
    setEditingSubtitleJob(null);
  }, []);

  const restoreFromHistory = React.useCallback((history: HistorySnapshot, videoId: string) => {
    setActiveJobs(restoreActiveJobsFromHistory(history, videoId));
    setEditingSubtitleJob(null);
  }, []);

  const selectVariation = React.useCallback((job: JobDto) => {
    setActiveJobs((current) => selectActiveJobVariation(current, job));
  }, []);

  return {
    activeJobs,
    activeJobList: activeJobsList(activeJobs),
    editingSubtitleJob,
    setEditingSubtitleJob,
    setRole,
    updateById,
    clearById,
    reset,
    restoreFromHistory,
    selectVariation
  };
}
