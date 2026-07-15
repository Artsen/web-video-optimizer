import type { HistorySnapshot, JobDto } from "@local-video-optimizer/contracts";

export type ActiveJobRole = "primary" | "sample" | "poster" | "package" | "subtitle" | "mux";

export type ActiveJobs = Record<ActiveJobRole, JobDto | null>;

export const emptyActiveJobs: ActiveJobs = {
  primary: null,
  sample: null,
  poster: null,
  package: null,
  subtitle: null,
  mux: null
};

const jobKindToRole: Partial<Record<JobDto["kind"], ActiveJobRole>> = {
  encode: "primary",
  sample: "sample",
  poster: "poster",
  package: "package",
  subtitle: "subtitle",
  mux: "mux"
};

export function setActiveJobRole(activeJobs: ActiveJobs, role: ActiveJobRole, job: JobDto | null): ActiveJobs {
  return { ...activeJobs, [role]: job };
}

export function updateActiveJobsById(activeJobs: ActiveJobs, updated: JobDto): ActiveJobs {
  return mapActiveJobs(activeJobs, (job) => (job?.id === updated.id ? updated : job));
}

export function clearActiveJobsById(activeJobs: ActiveJobs, jobId: string): ActiveJobs {
  return mapActiveJobs(activeJobs, (job) => (job?.id === jobId ? null : job));
}

export function restoreActiveJobsFromHistory(history: HistorySnapshot, videoId: string): ActiveJobs {
  const restored = { ...emptyActiveJobs };
  const jobs = history.jobs.filter((job) => job.videoId === videoId);
  for (const job of jobs) {
    const role = jobKindToRole[job.kind];
    if (role && !restored[role]) restored[role] = job;
  }
  return restored;
}

export function selectActiveJobVariation(activeJobs: ActiveJobs, job: JobDto): ActiveJobs {
  const role = jobKindToRole[job.kind];
  if (!role) return activeJobs;
  const next = setActiveJobRole(activeJobs, role, job);
  if ((job.kind === "encode" || job.kind === "mux") && job.status === "completed") {
    return setActiveJobRole(next, "primary", job);
  }
  return next;
}

export function activeJobsList(activeJobs: ActiveJobs): JobDto[] {
  return Object.values(activeJobs).filter((job): job is JobDto => Boolean(job));
}

function mapActiveJobs(activeJobs: ActiveJobs, mapper: (job: JobDto | null) => JobDto | null): ActiveJobs {
  return {
    primary: mapper(activeJobs.primary),
    sample: mapper(activeJobs.sample),
    poster: mapper(activeJobs.poster),
    package: mapper(activeJobs.package),
    subtitle: mapper(activeJobs.subtitle),
    mux: mapper(activeJobs.mux)
  };
}
