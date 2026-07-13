import type { JobDto } from "@local-video-optimizer/contracts";

export type JobEntity = JobDto & {
  outputPath?: string;
  sidecarPath?: string;
};
