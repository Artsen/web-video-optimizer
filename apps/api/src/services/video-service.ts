import fs from "node:fs";
import path from "node:path";
import { rm } from "node:fs/promises";
import { nanoid } from "nanoid";
import { normalizeProbe, sanitizeFileName } from "@local-video-optimizer/video-core";
import type { VideoMetadata, VideoRecordDto } from "@local-video-optimizer/contracts";
import { toVideoRecordDto } from "../dto/video-dto.js";
import type { VideoEntity } from "../entities/video-entity.js";
import type { MediaProbe } from "../infrastructure/tools/ffprobe-adapter.js";
import type { VideoDownloader } from "../infrastructure/tools/yt-dlp-adapter.js";
import type { VideoRepository, JobRepository } from "../repositories/repository-types.js";
import type { UploadedVideoFile, StreamDescriptor } from "../runtime/api-runtime.js";
import type { CleanupService } from "./cleanup-service.js";
import type { StatePersistenceService } from "./state-persistence-service.js";

const removeOptions = { force: true, maxRetries: 5, retryDelay: 150 };

export class VideoService {
  constructor(
    private readonly videos: VideoRepository,
    private readonly jobs: JobRepository,
    private readonly mediaProbe: MediaProbe,
    private readonly downloader: VideoDownloader,
    private readonly cleanup: CleanupService,
    private readonly persistence: StatePersistenceService,
    private readonly uploadDir: string,
    private readonly tmpDir: string
  ) {}

  async createFromUpload(file: UploadedVideoFile): Promise<VideoRecordDto> {
    if (!file.path) {
      throw new Error("Uploaded file path is required");
    }
    return toVideoRecordDto(await this.createRecordFromFile(file.path, file.originalName));
  }

  async createFromUrl(url: string): Promise<VideoRecordDto> {
    const importPath = await this.downloader.download(url, this.tmpDir);
    return toVideoRecordDto(await this.createRecordFromFile(importPath, path.basename(importPath)));
  }

  get(id: string): VideoRecordDto | undefined {
    const video = this.videos.get(id);
    return video ? toVideoRecordDto(video) : undefined;
  }

  getMetadata(id: string): VideoMetadata | undefined {
    return this.videos.get(id)?.metadata;
  }

  getSource(id: string): StreamDescriptor | undefined {
    const video = this.videos.get(id);
    return video ? { filePath: video.storedPath, fileName: video.originalName } : undefined;
  }

  getDownload(id: string): StreamDescriptor | undefined {
    const video = this.videos.get(id);
    return video && fs.existsSync(video.storedPath)
      ? { filePath: video.storedPath, fileName: video.originalName }
      : undefined;
  }

  async rename(id: string, originalName: string): Promise<VideoRecordDto | undefined> {
    const video = this.videos.get(id);
    if (!video) return undefined;
    const cleanBase = sanitizeFileName(path.parse(originalName).name);
    if (!cleanBase) throw new Error("Enter a filename with letters or numbers.");
    const currentExtension = path.extname(video.originalName) || path.extname(video.storedPath) || ".mp4";
    const requestedExtension = path.extname(originalName);
    const extension =
      requestedExtension && requestedExtension.toLowerCase() === currentExtension.toLowerCase()
        ? requestedExtension
        : currentExtension;
    video.originalName = `${cleanBase}${extension}`;
    video.metadata.fileName = video.originalName;
    await this.persistence.save();
    return toVideoRecordDto(video);
  }

  async delete(id: string): Promise<boolean> {
    const video = this.videos.get(id);
    if (!video) return false;
    await this.cleanup.removeVideoRecord(video);
    await this.cleanup.pruneOrphanFiles();
    await this.persistence.save();
    return true;
  }

  async mergeDuplicateVideos(): Promise<void> {
    const byHash = new Map<string, VideoEntity>();
    for (const video of this.videos.getAll().sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))) {
      if (!video.sourceHash) continue;
      const keeper = byHash.get(video.sourceHash);
      if (!keeper) {
        byHash.set(video.sourceHash, video);
        continue;
      }

      for (const job of this.jobs.getAll()) {
        if (job.videoId === video.id) {
          job.videoId = keeper.id;
        }
      }
      await rm(video.storedPath, removeOptions);
      this.videos.delete(video.id);
    }
  }

  async createRecordFromFile(
    filePath: string,
    originalName: string,
    uploadedAt = new Date().toISOString()
  ): Promise<VideoEntity> {
    const sourceHash = await this.persistence.fileHash(filePath);
    const existing = this.videos.findBySourceHash(sourceHash);
    if (existing) {
      await rm(filePath, removeOptions);
      return existing;
    }

    const id = nanoid();
    const extension = path.extname(originalName) || path.extname(filePath) || ".mp4";
    const storedPath = path.join(this.uploadDir, `${id}${extension}`);
    await fs.promises.rename(filePath, storedPath);

    const probe = await this.mediaProbe.probe(storedPath);
    const record: VideoEntity = {
      id,
      originalName,
      storedPath,
      uploadedAt,
      sourceHash,
      metadata: normalizeProbe(originalName, probe)
    };
    this.videos.set(record);
    await this.persistence.save();
    return record;
  }
}
