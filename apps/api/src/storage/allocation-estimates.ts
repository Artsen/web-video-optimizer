import type { JobEntity } from "../entities/job-entity.js";
import type { VideoEntity } from "../entities/video-entity.js";
import { estimateOutputSize } from "@local-video-optimizer/video-core";
import type { OptimizationSettings } from "@local-video-optimizer/contracts";

const ONE_MIB = 1024 * 1024;
const MANIFEST_OVERHEAD_BYTES = 256 * 1024;

export function estimateEncodeAllocation(video: VideoEntity, settings: OptimizationSettings): number {
  const estimate = estimateOutputSize(video.metadata, settings).bytes;
  const sourceSize = video.metadata.fileSize || ONE_MIB;
  return Math.ceil(Math.max(estimate ?? 0, sourceSize * 0.35, ONE_MIB) + MANIFEST_OVERHEAD_BYTES);
}

export function estimateSampleAllocation(
  video: VideoEntity,
  settings: OptimizationSettings,
  sampleSeconds: number
): number {
  const duration = Math.max(1, video.metadata.durationSeconds || sampleSeconds);
  return Math.ceil(
    (estimateEncodeAllocation(video, settings) * Math.min(sampleSeconds, duration)) / duration + ONE_MIB
  );
}

export function estimatePosterAllocation(): number {
  return ONE_MIB + MANIFEST_OVERHEAD_BYTES;
}

export function estimateSubtitleAllocation(video: VideoEntity): number {
  const duration = Math.max(1, video.metadata.durationSeconds || 1);
  const wavBytes = duration * 16_000 * 2;
  return Math.ceil(wavBytes + ONE_MIB + MANIFEST_OVERHEAD_BYTES);
}

export function estimateMuxAllocation(videoJob: JobEntity): number {
  return Math.ceil((videoJob.outputSize ?? 0) + ONE_MIB + MANIFEST_OVERHEAD_BYTES);
}

export function estimatePackageAllocation(jobs: JobEntity[]): number {
  const inputBytes = jobs.reduce((total, job) => total + (job.outputSize ?? 0), 0);
  return Math.ceil(inputBytes * 1.08 + ONE_MIB + MANIFEST_OVERHEAD_BYTES);
}

export function estimateImportAllocation(uploadLimitBytes: number): number {
  return uploadLimitBytes + MANIFEST_OVERHEAD_BYTES;
}
