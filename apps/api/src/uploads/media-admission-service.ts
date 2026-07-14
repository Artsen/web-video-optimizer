import { nanoid } from "nanoid";
import { normalizeProbe } from "@local-video-optimizer/video-core";
import type { FFprobeResult, FFprobeStream } from "@local-video-optimizer/video-core";
import type { VideoEntity } from "../entities/video-entity.js";
import type { MediaProbe } from "../infrastructure/tools/ffprobe-adapter.js";
import type { VideoRepository } from "../repositories/repository-types.js";
import type { StatePersistenceService } from "../services/state-persistence-service.js";
import { StorageBoundary } from "../storage/storage-boundary.js";
import type { StorageArea } from "../storage/storage-boundary.js";
import { StorageBoundaryError } from "../storage/storage-error.js";
import { inspectContentSignature } from "./content-signature.js";
import { validateUploadOriginalName } from "./filename-validation.js";
import { uploadErrors } from "./upload-errors.js";

export type StagedUpload = {
  path: string;
  originalName: string;
  area: StorageArea;
};

export class MediaAdmissionService {
  constructor(
    private readonly videos: VideoRepository,
    private readonly mediaProbe: MediaProbe,
    private readonly persistence: StatePersistenceService,
    private readonly storage: StorageBoundary,
    private readonly uploadFileSizeLimitBytes: number
  ) {}

  async admit(upload: StagedUpload, uploadedAt = new Date().toISOString()): Promise<VideoEntity> {
    const originalName = validateUploadOriginalName(upload.originalName);
    let candidatePath: string | undefined;
    let permanentPath: string | undefined;
    let insertedId: string | undefined;

    try {
      const candidate = await this.validateCandidate(upload);
      candidatePath = candidate.path;
      const signature = await inspectContentSignature(candidate.path);
      const sourceHash = await this.persistence.fileHash(candidate.path);
      const existing = this.videos.findBySourceHash(sourceHash);
      if (existing) {
        await this.storage.removeFile(upload.area, candidate.path);
        return existing;
      }

      const probe = await this.mediaProbe.probe(candidate.path).catch(() => {
        throw uploadErrors.invalidMedia();
      });
      this.validateProbe(probe);

      const id = nanoid();
      const storedFileName = `${id}${this.extensionForProbe(probe, signature.extension)}`;
      permanentPath = this.storage.pathFor("uploads", storedFileName);
      await this.storage.moveContained(upload.area, candidate.path, "uploads", storedFileName);
      candidatePath = undefined;

      const record: VideoEntity = {
        id,
        originalName,
        storedPath: permanentPath,
        uploadedAt,
        sourceHash,
        metadata: normalizeProbe(originalName, probe)
      };
      this.videos.set(record);
      insertedId = id;
      try {
        await this.persistence.save();
      } catch (error) {
        this.videos.delete(id);
        await this.storage.removeFile("uploads", permanentPath);
        throw error;
      }
      return record;
    } catch (error) {
      if (insertedId) this.videos.delete(insertedId);
      if (permanentPath) await this.storage.removeFile("uploads", permanentPath).catch(() => undefined);
      if (candidatePath) await this.storage.removeFile(upload.area, candidatePath).catch(() => undefined);
      throw error;
    }
  }

  private async validateCandidate(upload: StagedUpload): Promise<{ path: string; size: number }> {
    try {
      return await this.storage.validateCandidate(upload.area, upload.path, this.uploadFileSizeLimitBytes);
    } catch (error) {
      if (error instanceof StorageBoundaryError) {
        if (error.message === "Uploaded file is empty") throw uploadErrors.emptyFile();
        if (error.message === "Uploaded file is too large") throw uploadErrors.tooLarge();
      }
      throw error;
    }
  }

  private validateProbe(probe: FFprobeResult): void {
    const streams = probe.streams ?? [];
    const video = streams.find((stream) => isTemporalVideoStream(stream));
    if (!video) throw uploadErrors.invalidMedia();
    if (
      !Number.isFinite(video.width) ||
      !Number.isFinite(video.height) ||
      (video.width ?? 0) <= 0 ||
      (video.height ?? 0) <= 0
    ) {
      throw uploadErrors.invalidMedia();
    }
    const duration = Number(video.tags?.DURATION ?? probe.format?.duration);
    const fallbackDuration = Number(probe.format?.duration);
    const usableDuration = Number.isFinite(duration) && duration > 0 ? duration : fallbackDuration;
    if (!Number.isFinite(usableDuration) || usableDuration <= 0) throw uploadErrors.invalidMedia();

    const container = probe.format?.format_name;
    if (!container || !/(mp4|mov|matroska|webm|avi|ogg|flv|mpeg|mpegts|asf)/i.test(container)) {
      throw uploadErrors.unsupportedMedia();
    }
  }

  private extensionForProbe(probe: FFprobeResult, fallback: string): string {
    const container = probe.format?.format_name?.toLowerCase() ?? "";
    if (container.includes("matroska") || container.includes("webm")) return ".webm";
    if (container.includes("avi")) return ".avi";
    if (container.includes("ogg")) return ".ogv";
    if (container.includes("flv")) return ".flv";
    if (container.includes("mpegts")) return ".ts";
    if (container.includes("mpeg")) return ".mpg";
    if (container.includes("asf")) return ".wmv";
    return fallback || ".mp4";
  }
}

function isTemporalVideoStream(stream: FFprobeStream): boolean {
  if (stream.codec_type !== "video") return false;
  const disposition = (stream as { disposition?: Record<string, number> }).disposition;
  if (disposition?.attached_pic === 1) return false;
  return Boolean(stream.codec_name);
}
