import { JobDtoSchema, VideoRecordDtoSchema } from "@local-video-optimizer/contracts";
import type { JobEntity } from "../entities/job-entity.js";
import type { ManifestSnapshot } from "../entities/manifest.js";
import type { VideoEntity } from "../entities/video-entity.js";

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestValidationError";
  }
}

export function validateManifestSnapshot(value: unknown): ManifestSnapshot {
  if (!isRecord(value)) {
    throw new ManifestValidationError("Manifest must be an object");
  }
  if (!Array.isArray(value.videos)) {
    throw new ManifestValidationError("Manifest videos must be an array");
  }
  if (!Array.isArray(value.jobs)) {
    throw new ManifestValidationError("Manifest jobs must be an array");
  }

  return {
    videos: value.videos.map((video, index) => validateVideo(video, index)),
    jobs: value.jobs.map((job, index) => validateJob(job, index))
  };
}

function validateVideo(value: unknown, index: number): VideoEntity {
  const parsed = VideoRecordDtoSchema.safeParse(value);
  if (!parsed.success) {
    throw new ManifestValidationError(`Manifest video at index ${index} is invalid`);
  }
  if (!isRecord(value) || typeof value.storedPath !== "string" || value.storedPath.length === 0) {
    throw new ManifestValidationError(`Manifest video at index ${index} is missing storedPath`);
  }
  if (value.sourceHash !== undefined && typeof value.sourceHash !== "string") {
    throw new ManifestValidationError(`Manifest video at index ${index} has invalid sourceHash`);
  }
  return {
    ...parsed.data,
    storedPath: value.storedPath,
    sourceHash: value.sourceHash
  };
}

function validateJob(value: unknown, index: number): JobEntity {
  const parsed = JobDtoSchema.safeParse(value);
  if (!parsed.success) {
    throw new ManifestValidationError(`Manifest job at index ${index} is invalid`);
  }
  if (!isRecord(value)) {
    throw new ManifestValidationError(`Manifest job at index ${index} must be an object`);
  }
  if (value.outputPath !== undefined && typeof value.outputPath !== "string") {
    throw new ManifestValidationError(`Manifest job at index ${index} has invalid outputPath`);
  }
  if (value.sidecarPath !== undefined && typeof value.sidecarPath !== "string") {
    throw new ManifestValidationError(`Manifest job at index ${index} has invalid sidecarPath`);
  }
  return {
    ...parsed.data,
    outputPath: value.outputPath,
    sidecarPath: value.sidecarPath
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
