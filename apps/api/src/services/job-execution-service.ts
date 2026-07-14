import { stat } from "node:fs/promises";
import { buildFfmpegArgs } from "@local-video-optimizer/video-core";
import type { OptimizationSettings } from "@local-video-optimizer/contracts";
import type { JobEntity } from "../entities/job-entity.js";
import type { ProcessExecutionPolicy } from "../infrastructure/processes/process-execution-policy.js";
import type { ProcessRegistry } from "../infrastructure/processes/process-registry.js";
import type { ProcessRunner } from "../infrastructure/processes/process-runner.js";
import { superviseProcess } from "../infrastructure/processes/process-supervisor.js";
import type { JobRepository, VideoRepository } from "../repositories/repository-types.js";
import type { CleanupService } from "./cleanup-service.js";
import type { JobLifecycle } from "./job-lifecycle-service.js";
import type { StatePersistenceService } from "./state-persistence-service.js";
import { commandPreview } from "./helpers/command-preview.js";

export function buildMuxSubtitleArgs(
  inputPath: string,
  subtitlePath: string,
  outputPath: string,
  container: OptimizationSettings["outputContainer"]
): string[] {
  const args = ["-y", "-i", inputPath, "-i", subtitlePath, "-map", "0", "-map", "1:0", "-c", "copy"];
  args.push("-c:s", container === "mp4" ? "mov_text" : "webvtt");
  args.push("-metadata:s:s:0", "language=eng", "-disposition:s:0", "default");
  if (container === "mp4") args.push("-movflags", "+faststart");
  args.push(outputPath);
  return args;
}

export interface JobExecutor {
  runEncode(job: JobEntity, inputPath: string, durationLimitSeconds?: number): Promise<void>;
  runPoster(job: JobEntity, inputPath: string, atSeconds: number): Promise<void>;
  runMux(job: JobEntity, videoJob: JobEntity, subtitleJob: JobEntity): Promise<void>;
}

export class JobExecutionService implements JobExecutor {
  constructor(
    private readonly processRunner: ProcessRunner,
    private readonly processRegistry: ProcessRegistry,
    private readonly videos: VideoRepository,
    private readonly jobs: JobRepository,
    private readonly persistence: StatePersistenceService,
    private readonly cleanup: CleanupService,
    private readonly lifecycle: JobLifecycle,
    private readonly mediaPolicy: ProcessExecutionPolicy
  ) {}

  runEncode(job: JobEntity, inputPath: string, durationLimitSeconds?: number): Promise<void> {
    if (!this.lifecycle.start(job, "Encoding started")) {
      return Promise.resolve();
    }
    this.persistence.scheduleSave();

    const args = [
      "-progress",
      "pipe:1",
      "-nostats",
      ...buildFfmpegArgs(inputPath, job.outputPath!, job.settings, durationLimitSeconds)
    ];
    const child = this.processRunner.spawn("ffmpeg", args, { windowsHide: true });
    this.processRegistry.set(job.id, child);

    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      const outTimeMs = text.match(/out_time_ms=(\d+)/);
      const sourceDuration = durationLimitSeconds ?? this.videos.get(job.videoId)?.metadata.durationSeconds ?? 0;

      if (outTimeMs && sourceDuration > 0) {
        const elapsed = Number(outTimeMs[1]) / 1_000_000;
        const progress = Math.min(99, Math.round((elapsed / sourceDuration) * 100));
        this.lifecycle.updateProgress(job, progress, `Encoding ${progress}%`);
      }
    });

    this.updateMessageFromStderr(job, child);

    return this.settleOnProcessEvents(job, child, {
      onError: async (error) => {
        if (this.lifecycle.fail(job, error.message)) {
          await this.cleanup.removeJobArtifacts(job);
          await this.persistence.save();
        }
      },
      onClose: async (code) => {
        if (job.status === "canceled") {
          job.progress = 0;
          await this.persistence.save();
          return;
        }
        if (code !== 0) {
          if (this.lifecycle.fail(job, `FFmpeg exited with code ${code}`)) {
            await this.cleanup.removeJobArtifacts(job);
            await this.persistence.save();
          }
          return;
        }

        if (this.lifecycle.complete(job, "Encoding complete")) {
          job.outputSize = (await stat(job.outputPath!)).size;
          if (job.kind === "sample" && durationLimitSeconds) {
            const duration = this.videos.get(job.videoId)?.metadata.durationSeconds ?? 0;
            const estimatedFullSize =
              duration > 0 ? Math.round((job.outputSize * duration) / durationLimitSeconds) : job.outputSize;
            const originalSize = this.videos.get(job.videoId)?.metadata.fileSize;
            job.sampleEstimate = {
              sampleSeconds: durationLimitSeconds,
              estimatedFullSize,
              estimatedReduction: originalSize ? Math.round((1 - estimatedFullSize / originalSize) * 100) : undefined
            };
          }
          await this.persistence.save();
        }
      }
    });
  }

  runPoster(job: JobEntity, inputPath: string, atSeconds: number): Promise<void> {
    if (!this.lifecycle.start(job, "Generating poster")) {
      return Promise.resolve();
    }
    this.persistence.scheduleSave();

    const args = [
      "-y",
      "-ss",
      String(atSeconds),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-c:v",
      "libwebp",
      "-quality",
      "82",
      job.outputPath!
    ];
    const child = this.processRunner.spawn("ffmpeg", args, { windowsHide: true });
    this.processRegistry.set(job.id, child);
    job.ffmpegCommand = commandPreview(args);

    return this.settleOnProcessEvents(job, child, {
      onError: async (error) => {
        if (this.lifecycle.fail(job, error.message)) {
          await this.cleanup.removeJobArtifacts(job);
          await this.persistence.save();
        }
      },
      onClose: async (code) => {
        if (job.status === "canceled") {
          await this.persistence.save();
          return;
        }
        if (code !== 0) {
          if (this.lifecycle.fail(job, `FFmpeg exited with code ${code}`)) {
            await this.cleanup.removeJobArtifacts(job);
            await this.persistence.save();
          }
          return;
        }
        if (this.lifecycle.complete(job, "Poster generated")) {
          job.outputSize = (await stat(job.outputPath!)).size;
          await this.persistence.save();
        }
      }
    });
  }

  runMux(job: JobEntity, videoJob: JobEntity, subtitleJob: JobEntity): Promise<void> {
    if (!this.lifecycle.start(job, "Embedding subtitle track")) {
      return Promise.resolve();
    }
    this.persistence.scheduleSave();

    const args = [
      "-progress",
      "pipe:1",
      "-nostats",
      ...buildMuxSubtitleArgs(
        videoJob.outputPath!,
        subtitleJob.outputPath!,
        job.outputPath!,
        job.settings.outputContainer
      )
    ];
    const child = this.processRunner.spawn("ffmpeg", args, { windowsHide: true });
    this.processRegistry.set(job.id, child);

    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      const outTimeMs = text.match(/out_time_ms=(\d+)/);
      const sourceDuration = this.videos.get(job.videoId)?.metadata.durationSeconds ?? 0;
      if (outTimeMs && sourceDuration > 0) {
        const elapsed = Number(outTimeMs[1]) / 1_000_000;
        const progress = Math.min(99, Math.round((elapsed / sourceDuration) * 100));
        this.lifecycle.updateProgress(job, progress, `Embedding captions ${progress}%`);
      }
    });

    this.updateMessageFromStderr(job, child);

    return this.settleOnProcessEvents(job, child, {
      onError: async (error) => {
        if (this.lifecycle.fail(job, error.message)) {
          await this.cleanup.removeJobArtifacts(job);
          await this.persistence.save();
        }
      },
      onClose: async (code) => {
        if (job.status === "canceled") {
          job.progress = 0;
          await this.persistence.save();
          return;
        }
        if (code !== 0) {
          if (this.lifecycle.fail(job, `FFmpeg exited with code ${code}`)) {
            await this.cleanup.removeJobArtifacts(job);
            await this.persistence.save();
          }
          return;
        }

        if (this.lifecycle.complete(job, "Captions embedded")) {
          job.outputSize = (await stat(job.outputPath!)).size;
          await this.persistence.save();
        }
      }
    });
  }

  private updateMessageFromStderr(job: JobEntity, child: ReturnType<ProcessRunner["spawn"]>): void {
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text && job.status === "running") {
        job.message = text.split("\n").at(-1)?.slice(0, 220) || job.message;
      }
    });
  }

  private settleOnProcessEvents(
    job: JobEntity,
    child: ReturnType<ProcessRunner["spawn"]>,
    handlers: {
      onError: (error: Error) => Promise<void>;
      onClose: (code: number | null) => Promise<void>;
    }
  ): Promise<void> {
    const supervisor = superviseProcess(child, "ffmpeg", this.mediaPolicy, {
      onForceSettle: () => {
        console.warn(`Force-settled timed-out media process for job ${job.id}`);
      }
    });

    return supervisor.promise.then(async (result) => {
      this.processRegistry.delete(job.id);
      if (result.kind === "timeout") {
        if (job.status === "canceled") {
          await this.persistence.save();
          return;
        }
        if (this.lifecycle.fail(job, `Media processing timed out after ${this.mediaPolicy.timeoutMs} ms`)) {
          await this.cleanup.removeJobArtifacts(job);
          await this.persistence.save();
        }
        return;
      }
      if (result.kind === "error") {
        await handlers.onError(result.error);
        return;
      }
      await handlers.onClose(result.code);
    });
  }
}
