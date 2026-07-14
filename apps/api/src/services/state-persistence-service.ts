import fs from "node:fs";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { JobEntity } from "../entities/job-entity.js";
import type { ManifestSnapshot } from "../entities/manifest.js";
import type { VideoEntity } from "../entities/video-entity.js";
import type { ManifestSource, ManifestStore } from "../persistence/manifest-store.js";
import type { JobRepository, VideoRepository } from "../repositories/repository-types.js";
import type { StorageBoundary } from "../storage/storage-boundary.js";

export type RecoveryReport = {
  manifestSource: "none" | ManifestSource;
  restoredVideos: number;
  restoredJobs: number;
  canceledInterruptedJobs: number;
  failedMissingOutputJobs: number;
  skippedDanglingJobs: number;
  removedPartialArtifacts: number;
  recoveredFromBackup: boolean;
};

export interface StatePersistenceService {
  fileHash(filePath: string): Promise<string>;
  save(): Promise<void>;
  scheduleSave(): void;
  flush(): Promise<void>;
  load(): Promise<RecoveryReport>;
}

export class ManifestStatePersistenceService implements StatePersistenceService {
  #saveTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly videos: VideoRepository,
    private readonly jobs: JobRepository,
    private readonly manifestStore: ManifestStore,
    private readonly options: { tmpDir?: string; storage?: StorageBoundary } = {}
  ) {}

  async fileHash(filePath: string): Promise<string> {
    const hash = createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", resolve);
    });
    return hash.digest("hex");
  }

  save(): Promise<void> {
    const saveOperation = this.#saveTail.then(() => this.manifestStore.save(this.snapshot()));
    this.#saveTail = saveOperation.catch(() => undefined);
    return saveOperation;
  }

  scheduleSave(): void {
    this.save().catch((error) => {
      console.error("Unable to persist application state:", error);
    });
  }

  async flush(): Promise<void> {
    await this.#saveTail;
  }

  async load(): Promise<RecoveryReport> {
    const result = await this.manifestStore.load();
    const report: RecoveryReport = {
      manifestSource: result.kind === "loaded" ? result.source : "none",
      restoredVideos: 0,
      restoredJobs: 0,
      canceledInterruptedJobs: 0,
      failedMissingOutputJobs: 0,
      skippedDanglingJobs: 0,
      removedPartialArtifacts: 0,
      recoveredFromBackup: result.kind === "loaded" ? result.recoveredFromBackup : false
    };

    if (result.kind === "missing") return report;

    const restoredVideoIds = new Set<string>();
    for (const video of result.snapshot.videos) {
      await this.validateVideoPath(video);
      if (!(await this.fileExists("uploads", video.storedPath))) continue;
      const restored: VideoEntity = {
        ...video,
        sourceHash: video.sourceHash ?? (await this.fileHash(video.storedPath))
      };
      this.videos.set(restored);
      restoredVideoIds.add(restored.id);
      report.restoredVideos += 1;
    }

    const recoveryTime = new Date().toISOString();
    for (const job of result.snapshot.jobs) {
      if (!restoredVideoIds.has(job.videoId)) {
        report.skippedDanglingJobs += 1;
        continue;
      }

      const restored = { ...job };
      await this.validateJobPaths(restored);
      if (restored.status === "queued" || restored.status === "running") {
        restored.status = "canceled";
        restored.progress = 0;
        restored.message = "Canceled by API restart";
        restored.completedAt = recoveryTime;
        report.removedPartialArtifacts += await this.removeJobArtifacts(restored);
        report.canceledInterruptedJobs += 1;
      } else if (restored.status === "completed" && !this.hasRequiredOutput(restored)) {
        restored.status = "failed";
        restored.progress = 0;
        restored.message = "Output missing during API restart recovery";
        restored.completedAt = restored.completedAt ?? recoveryTime;
        restored.outputSize = undefined;
        restored.outputPath = undefined;
        restored.sidecarPath = undefined;
        report.failedMissingOutputJobs += 1;
      }

      this.jobs.set(restored);
      report.restoredJobs += 1;
    }

    return report;
  }

  private snapshot(): ManifestSnapshot {
    return {
      videos: this.videos.getAll(),
      jobs: this.jobs.getAll()
    };
  }

  private hasRequiredOutput(job: JobEntity): boolean {
    return Boolean(job.outputPath && fs.existsSync(job.outputPath));
  }

  private async validateVideoPath(video: VideoEntity): Promise<void> {
    if (this.options.storage)
      await this.options.storage.assertExistingRegularFile("uploads", video.storedPath).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      });
  }

  private async validateJobPaths(job: JobEntity): Promise<void> {
    if (!this.options.storage) return;
    if (job.outputPath) {
      await this.options.storage.assertExistingRegularFile("outputs", job.outputPath).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      });
    }
    if (job.sidecarPath) {
      await this.options.storage.assertExistingRegularFile("outputs", job.sidecarPath).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      });
    }
  }

  private async fileExists(area: "uploads" | "outputs", filePath: string): Promise<boolean> {
    if (this.options.storage) return this.options.storage.fileExists(area, filePath);
    return fs.existsSync(filePath);
  }

  private async removeJobArtifacts(job: JobEntity): Promise<number> {
    let removed = 0;
    for (const artifactPath of [job.outputPath, job.sidecarPath]) {
      if (!artifactPath) continue;
      if (fs.existsSync(artifactPath)) removed += 1;
      await fs.promises.rm(artifactPath, { force: true });
    }

    if (this.options.tmpDir && fs.existsSync(this.options.tmpDir)) {
      const entries = await fs.promises.readdir(this.options.tmpDir, { withFileTypes: true });
      await Promise.all(
        entries
          .filter((entry) => entry.name.includes(job.id))
          .map(async (entry) => {
            removed += 1;
            await fs.promises.rm(path.join(this.options.tmpDir!, entry.name), { recursive: true, force: true });
          })
      );
    }

    return removed;
  }
}
