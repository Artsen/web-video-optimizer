import type { JobDto } from "@local-video-optimizer/contracts";
import type { JobEntity } from "../runtime/api-runtime.js";

export function toJobDto(job: JobEntity): JobDto {
  return {
    id: job.id,
    videoId: job.videoId,
    status: job.status,
    kind: job.kind,
    progress: job.progress,
    message: job.message,
    outputFileName: job.outputFileName,
    sidecarFileName: job.sidecarFileName,
    outputSize: job.outputSize,
    ffmpegCommand: job.ffmpegCommand,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    settings: job.settings,
    sampleEstimate: job.sampleEstimate
  };
}
