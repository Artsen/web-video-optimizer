import fs from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { JobEntity } from "../entities/job-entity.js";
import type { VideoEntity } from "../entities/video-entity.js";
import type { ProcessRegistry } from "../infrastructure/processes/process-registry.js";
import type { JobRepository, VideoRepository } from "../repositories/repository-types.js";
import type { StatePersistenceService } from "./state-persistence-service.js";

const removeOptions = { force: true, maxRetries: 5, retryDelay: 150 };

export class CleanupService {
  constructor(
    private readonly videos: VideoRepository,
    private readonly jobs: JobRepository,
    private readonly processRegistry: ProcessRegistry,
    private readonly persistence: StatePersistenceService,
    private readonly directories: { uploadDir: string; outputDir: string; tmpDir: string }
  ) {}

  async removeJobArtifacts(job: JobEntity): Promise<void> {
    if (job.outputPath) await rm(job.outputPath, removeOptions);
    if (job.sidecarPath) await rm(job.sidecarPath, removeOptions);
  }

  async removeJob(job: JobEntity): Promise<void> {
    this.processRegistry.get(job.id)?.kill("SIGTERM");
    this.processRegistry.delete(job.id);
    await this.removeJobArtifacts(job);
    this.jobs.delete(job.id);
  }

  async removeVideoRecord(video: VideoEntity): Promise<void> {
    await rm(video.storedPath, removeOptions);
    for (const job of this.jobs.findByVideoId(video.id)) {
      if (job.videoId === video.id) {
        await this.removeJob(job);
      }
    }
    this.videos.delete(video.id);
  }

  async deleteHistory(videoIds: string[], jobIds: string[]): Promise<void> {
    for (const jobId of jobIds) {
      const job = this.jobs.get(jobId);
      if (!job) continue;
      await this.removeJob(job);
    }

    for (const videoId of videoIds) {
      const video = this.videos.get(videoId);
      if (!video) continue;
      await this.removeVideoRecord(video);
    }

    await this.pruneOrphanFiles();
    await this.persistence.save();
  }

  async pruneOrphanFiles(): Promise<void> {
    const uploadKeep = new Set(this.videos.getAll().map((video) => path.resolve(video.storedPath)));
    const outputKeep = new Set<string>();
    for (const job of this.jobs.getAll()) {
      if (job.outputPath) outputKeep.add(path.resolve(job.outputPath));
      if (job.sidecarPath) outputKeep.add(path.resolve(job.sidecarPath));
    }
    await Promise.all([
      this.pruneDirectory(this.directories.uploadDir, uploadKeep),
      this.pruneDirectory(this.directories.outputDir, outputKeep),
      this.pruneDirectory(this.directories.tmpDir, new Set())
    ]);
  }

  private async pruneDirectory(directory: string, keepPaths: Set<string>): Promise<void> {
    if (!fs.existsSync(directory)) return;
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(directory, entry.name);
        if (keepPaths.has(path.resolve(fullPath))) return;
        await rm(fullPath, { recursive: true, ...removeOptions });
      })
    );
  }
}
