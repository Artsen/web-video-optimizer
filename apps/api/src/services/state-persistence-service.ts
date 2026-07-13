import fs from "node:fs";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import type { JobEntity } from "../entities/job-entity.js";
import type { ManifestSnapshot } from "../entities/manifest.js";
import type { ManifestStore } from "../persistence/manifest-store.js";
import type { JobRepository, VideoRepository } from "../repositories/repository-types.js";

export interface StatePersistenceService {
  fileHash(filePath: string): Promise<string>;
  save(): Promise<void>;
  load(): Promise<void>;
}

export class ManifestStatePersistenceService implements StatePersistenceService {
  constructor(
    private readonly videos: VideoRepository,
    private readonly jobs: JobRepository,
    private readonly manifestStore: ManifestStore
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

  async save(): Promise<void> {
    const manifest: ManifestSnapshot = {
      videos: this.videos.getAll(),
      jobs: this.jobs
        .getAll()
        .filter((job) => job.status !== "canceled")
        .map((job) => this.persistedJob(job))
    };

    await this.manifestStore.save(manifest);
  }

  async load(): Promise<void> {
    const manifest = await this.manifestStore.load();
    if (!manifest) return;

    for (const video of manifest.videos ?? []) {
      if (fs.existsSync(video.storedPath)) {
        this.videos.set({
          ...video,
          sourceHash: video.sourceHash ?? (await this.fileHash(video.storedPath))
        });
      }
    }

    for (const job of manifest.jobs ?? []) {
      if (job.status === "canceled" || job.status === "running" || job.status === "queued") continue;
      const restored: JobEntity = {
        ...job,
        status: job.status,
        message: job.message
      };
      if (!restored.outputPath || fs.existsSync(restored.outputPath)) {
        this.jobs.set(restored);
      }
    }
  }

  private persistedJob(job: JobEntity): JobEntity {
    return {
      ...job,
      status: job.status === "running" || job.status === "queued" ? "canceled" : job.status,
      message: job.status === "running" || job.status === "queued" ? "Canceled by API restart" : job.message
    };
  }
}
