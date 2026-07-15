import type { HistorySnapshot, JobDto, VideoRecordDto } from "@local-video-optimizer/contracts";

export function jobsForVideo(history: HistorySnapshot, videoId?: string): JobDto[] {
  if (!videoId) return [];
  const byId = new Map<string, JobDto>();
  history.jobs.filter((job) => job.videoId === videoId).forEach((job) => byId.set(job.id, job));
  return Array.from(byId.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function latestJobByKind(jobs: JobDto[], kind: JobDto["kind"]): JobDto | undefined {
  return jobs.find((job) => job.kind === kind);
}

export function packageCandidateJobs(jobs: JobDto[]): JobDto[] {
  return jobs.filter((job) => job.status === "completed" && ["encode", "mux", "poster", "subtitle"].includes(job.kind));
}

export function runningJobs(jobs: JobDto[]): JobDto[] {
  return jobs.filter((job) => job.status === "queued" || job.status === "running");
}

export function finishedOutputJobs(jobs: JobDto[]): JobDto[] {
  return jobs.filter((job) => job.status !== "queued" && job.status !== "running");
}

export function completedOutputJobs(jobs: JobDto[]): JobDto[] {
  return finishedOutputJobs(jobs).filter((job) => job.status === "completed");
}

export function bestSavingsJob(jobs: JobDto[]): JobDto | undefined {
  return packageCandidateJobs(jobs)
    .filter((job) => job.outputSize)
    .sort((a, b) => (a.outputSize ?? Infinity) - (b.outputSize ?? Infinity))[0];
}

export function selectedPackageJobs(jobs: JobDto[], selectedIds: string[]): JobDto[] {
  const candidates = packageCandidateJobs(jobs);
  const selected = selectedIds.length === 0 ? candidates.map((job) => job.id) : selectedIds;
  return candidates.filter((job) => selected.includes(job.id));
}

export function packagePreviewSize(jobs: JobDto[]): number {
  return jobs.reduce((sum, job) => sum + (job.outputSize ?? 0), 0);
}

export function hasModernOutput(jobs: JobDto[]): boolean {
  return jobs.some(
    (job) =>
      (job.kind === "encode" || job.kind === "mux") &&
      job.status === "completed" &&
      (job.settings.outputContainer === "webm" || job.settings.videoCodec !== "libx264")
  );
}

export function hasFallbackOutput(jobs: JobDto[]): boolean {
  return jobs.some(
    (job) =>
      (job.kind === "encode" || job.kind === "mux") &&
      job.status === "completed" &&
      job.settings.outputContainer === "mp4" &&
      job.settings.videoCodec === "libx264"
  );
}

export function hasCompletedPoster(jobs: JobDto[]): boolean {
  return jobs.some((job) => job.kind === "poster" && job.status === "completed");
}

export function hasCompletedCaptions(jobs: JobDto[]): boolean {
  return jobs.some((job) => job.kind === "subtitle" && job.status === "completed");
}

export function findHistoryVideo(history: HistorySnapshot, videoId: string): VideoRecordDto | undefined {
  return history.videos.find((video) => video.id === videoId);
}
