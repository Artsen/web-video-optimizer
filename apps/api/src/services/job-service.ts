import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { JobDto, JobKind, OptimizationSettings } from "@local-video-optimizer/contracts";
import { buildFfmpegArgs, normalizeOptimizationSettings, sanitizeFileName } from "@local-video-optimizer/video-core";
import { toJobDto } from "../dto/job-dto.js";
import type { JobEntity } from "../entities/job-entity.js";
import type { VideoEntity } from "../entities/video-entity.js";
import type { FileRevealer } from "../infrastructure/desktop/file-revealer.js";
import type { JobRepository, VideoRepository } from "../repositories/repository-types.js";
import type { StreamDescriptor } from "../runtime/api-runtime.js";
import type { JobScheduler } from "../scheduling/job-scheduler.js";
import type { CleanupService } from "./cleanup-service.js";
import type { JobExecutor } from "./job-execution-service.js";
import type { JobLifecycle } from "./job-lifecycle-service.js";
import type { StatePersistenceService } from "./state-persistence-service.js";
import { commandPreview } from "./helpers/command-preview.js";
import { renamedOutputFileName } from "./helpers/output-file-name.js";

export class JobService {
  constructor(
    private readonly videos: VideoRepository,
    private readonly jobs: JobRepository,
    private readonly outputDir: string,
    private readonly persistence: StatePersistenceService,
    private readonly cleanup: CleanupService,
    private readonly execution: JobExecutor,
    private readonly fileRevealer: FileRevealer,
    private readonly scheduler: JobScheduler,
    private readonly lifecycle: JobLifecycle
  ) {}

  get(id: string): JobDto | undefined {
    const job = this.jobs.get(id);
    return job ? this.publicJob(job) : undefined;
  }

  createOptimizationJob(
    videoId: string,
    rawSettings: Partial<OptimizationSettings>
  ): { status: 200 | 202; job?: JobDto } {
    const video = this.videos.get(videoId);
    if (!video) return { status: 202 };
    const settings = normalizeOptimizationSettings(rawSettings ?? {});
    const existing = this.reusableJob(video, "encode", settings);
    if (existing) return { status: existing.status === "completed" ? 200 : 202, job: this.publicJob(existing) };
    const job = this.createEncodeJob(video, settings, "encode");
    this.enqueueMediaJob(job, () => this.execution.runEncode(job, video.storedPath));
    return { status: 202, job: this.publicJob(job) };
  }

  createSampleJob(
    videoId: string,
    rawSettings: Partial<OptimizationSettings>,
    rawSampleSeconds?: unknown
  ): { status: 200 | 202; job?: JobDto } {
    const video = this.videos.get(videoId);
    if (!video) return { status: 202 };
    const settings = normalizeOptimizationSettings({
      ...(rawSettings ?? {}),
      outputFilename: `${path.parse(video.originalName).name}-sample`
    });
    const sampleSeconds = Math.min(
      Math.max(Number(rawSampleSeconds ?? 5), 1),
      Math.max(1, video.metadata.durationSeconds || 5)
    );
    const existing = this.reusableJob(video, "sample", settings);
    if (existing) return { status: existing.status === "completed" ? 200 : 202, job: this.publicJob(existing) };
    const job = this.createEncodeJob(video, settings, "sample", "sample");
    this.enqueueMediaJob(job, () => this.execution.runEncode(job, video.storedPath, sampleSeconds));
    return { status: 202, job: this.publicJob(job) };
  }

  createPosterJob(videoId: string, rawAtSeconds?: unknown): JobDto | undefined {
    const video = this.videos.get(videoId);
    if (!video) return undefined;
    const atSeconds = Math.min(
      Math.max(Number(rawAtSeconds ?? Math.min(1, video.metadata.durationSeconds / 2)), 0),
      Math.max(0, video.metadata.durationSeconds - 0.1)
    );
    const jobId = nanoid();
    const baseName = sanitizeFileName(`${path.parse(video.originalName).name}-poster`);
    const outputFileName = `${baseName}.webp`;
    const outputPath = path.join(this.outputDir, `${jobId}-${outputFileName}`);
    const settings = normalizeOptimizationSettings({ outputFilename: baseName });
    const job: JobEntity = {
      id: jobId,
      videoId: video.id,
      status: "queued",
      kind: "poster",
      progress: 0,
      outputPath,
      outputFileName,
      ffmpegCommand: "",
      startedAt: new Date().toISOString(),
      settings
    };

    this.jobs.set(job);
    this.persistence.scheduleSave();
    this.enqueueMediaJob(job, () => this.execution.runPoster(job, video.storedPath, atSeconds));
    return this.publicJob(job);
  }

  createPairJobs(videoId: string): { jobs: JobDto[] } | undefined {
    const video = this.videos.get(videoId);
    if (!video) return undefined;

    const base = path.parse(video.originalName).name;
    const fallback = normalizeOptimizationSettings({
      outputContainer: "mp4",
      videoCodec: "libx264",
      audioCodec: "aac",
      width: 1280,
      frameRate: 24,
      crf: 26,
      preset: "slow",
      audioMode: "compress",
      audioBitrateKbps: 128,
      audioSampleRate: 48000,
      audioChannels: 2,
      cpuUsed: 5,
      fastStart: true,
      stripMetadata: true,
      outputFilename: `${base}-fallback-h264`
    });
    const modern = normalizeOptimizationSettings({
      outputContainer: "webm",
      videoCodec: "libaom-av1",
      audioCodec: "libopus",
      width: 1280,
      frameRate: 24,
      crf: 36,
      preset: "slow",
      audioMode: "compress",
      cpuUsed: 5,
      rowMt: true,
      audioBitrateKbps: 96,
      audioSampleRate: 48000,
      audioChannels: 2,
      fastStart: false,
      stripMetadata: true,
      outputFilename: `${base}-modern-av1`
    });

    const existingFallback = this.reusableJob(video, "encode", fallback);
    const existingModern = this.reusableJob(video, "encode", modern);
    const fallbackJob = existingFallback ?? this.createEncodeJob(video, fallback, "encode", "fallback-h264");
    const modernJob = existingModern ?? this.createEncodeJob(video, modern, "encode", "modern-av1");
    if (!existingFallback)
      this.enqueueMediaJob(fallbackJob, () => this.execution.runEncode(fallbackJob, video.storedPath));
    if (!existingModern) this.enqueueMediaJob(modernJob, () => this.execution.runEncode(modernJob, video.storedPath));
    return { jobs: [this.publicJob(fallbackJob), this.publicJob(modernJob)] };
  }

  async rename(id: string, outputFileName: string): Promise<JobDto | undefined> {
    const job = this.jobs.get(id);
    if (!job || !job.outputFileName) return undefined;
    job.outputFileName = renamedOutputFileName(job.outputFileName, outputFileName);
    if (job.sidecarFileName && path.extname(job.outputFileName).toLowerCase() === ".vtt") {
      job.sidecarFileName = `${path.parse(job.outputFileName).name}.srt`;
    }
    await this.persistence.save();
    return this.publicJob(job);
  }

  async cancel(id: string): Promise<JobDto | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.status !== "running" && job.status !== "queued") return this.publicJob(job);
    if (job.status === "queued") this.scheduler.cancelQueued(job.id);
    this.lifecycle.cancel(job, "Canceled and removed");
    const responseJob = this.publicJob(job);
    await this.cleanup.removeJob(job);
    await this.persistence.save();
    return responseJob;
  }

  getDownload(id: string): StreamDescriptor | undefined {
    return this.completedOutput(id);
  }

  getOutput(id: string): StreamDescriptor | undefined {
    return this.completedOutput(id);
  }

  getSidecar(id: string): StreamDescriptor | undefined {
    const job = this.jobs.get(id);
    return job?.status === "completed" && job.sidecarPath && job.sidecarFileName
      ? { filePath: job.sidecarPath, fileName: job.sidecarFileName }
      : undefined;
  }

  async reveal(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job || job.status !== "completed" || !job.outputPath || !fs.existsSync(job.outputPath)) return false;
    await this.fileRevealer.reveal(job.outputPath);
    return true;
  }

  async delete(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;
    await this.cleanup.removeJob(job);
    await this.cleanup.pruneOrphanFiles();
    await this.persistence.save();
    return true;
  }

  createEncodeJob(video: VideoEntity, settings: OptimizationSettings, kind: JobKind, suffix = "optimized"): JobEntity {
    const jobId = nanoid();
    const baseName = sanitizeFileName(settings.outputFilename || `${path.parse(video.originalName).name}-${suffix}`);
    const extension = settings.outputContainer === "webm" ? ".webm" : ".mp4";
    const outputFileName = `${baseName}${extension}`;
    const outputPath = path.join(this.outputDir, `${jobId}-${outputFileName}`);
    const args = buildFfmpegArgs(video.storedPath, outputPath, settings);
    const job: JobEntity = {
      id: jobId,
      videoId: video.id,
      status: "queued",
      kind,
      progress: 0,
      outputPath,
      outputFileName,
      ffmpegCommand: commandPreview(args),
      startedAt: new Date().toISOString(),
      settings
    };

    this.jobs.set(job);
    this.persistence.scheduleSave();
    return job;
  }

  publicJob(job: JobEntity): JobDto {
    return toJobDto(job);
  }

  private completedOutput(id: string): StreamDescriptor | undefined {
    const job = this.jobs.get(id);
    return job?.status === "completed" && job.outputPath && job.outputFileName
      ? { filePath: job.outputPath, fileName: job.outputFileName }
      : undefined;
  }

  private reusableJob(
    video: VideoEntity,
    kind: JobEntity["kind"],
    settings: OptimizationSettings
  ): JobEntity | undefined {
    return this.jobs
      .getAll()
      .find(
        (job) =>
          job.videoId === video.id &&
          job.kind === kind &&
          (job.status === "queued" || job.status === "running" || job.status === "completed") &&
          this.matchingSettings(job.settings, settings) &&
          (!job.outputPath || job.status !== "completed" || fs.existsSync(job.outputPath))
      );
  }

  private matchingSettings(a: OptimizationSettings, b: OptimizationSettings): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private enqueueMediaJob(job: JobEntity, run: () => Promise<void>): void {
    this.scheduler.enqueue({
      jobId: job.id,
      run,
      onUnhandledError: async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (this.lifecycle.fail(job, message)) {
          await this.cleanup.removeJobArtifacts(job);
          await this.persistence.save();
        }
      }
    });
  }
}
