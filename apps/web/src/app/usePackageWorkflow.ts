import React from "react";
import type { JobDto, PackageMetadata, VideoRecordDto } from "@local-video-optimizer/contracts";
import type { AppDependencies } from "./app-dependencies";
import { getReadableApiError } from "../api/api-error";

type Job = JobDto;
type VideoRecord = VideoRecordDto;

export function usePackageWorkflow({
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
}: {
  api: AppDependencies["api"];
  packageCandidateJobs: Job[];
  packageJobIds: string[];
  packageMetadata: PackageMetadata;
  packageMetadataReady: boolean;
  refreshHistory: () => Promise<void>;
  setActiveJobRole: (role: "package", job: Job) => void;
  setActiveView: React.Dispatch<React.SetStateAction<"prepare" | "outputs" | "custom" | "compare" | "captions">>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedPackageJobIds: React.Dispatch<React.SetStateAction<string[]>>;
  video: VideoRecord | null;
}) {
  function togglePackageJob(jobId: string) {
    const candidateIds = packageCandidateJobs.map((historyJob) => historyJob.id);
    setSelectedPackageJobIds((current) => {
      const active = current.length === 0 ? candidateIds : current;
      return active.includes(jobId) ? active.filter((id) => id !== jobId) : [...active, jobId];
    });
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
      setActiveJobRole("package", nextJob);
      setActiveView("outputs");
      void refreshHistory();
    } catch (packageError) {
      setError(getReadableApiError(packageError));
    }
  }

  return { createWebPackage, togglePackageJob };
}
