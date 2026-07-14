import fs from "node:fs";
import path from "node:path";
import { stat } from "node:fs/promises";
import { nanoid } from "nanoid";
import type { JobDto } from "@local-video-optimizer/contracts";
import {
  assertLooksLikeVtt,
  normalizeOptimizationSettings,
  sanitizeFileName,
  shiftCaptionTimings,
  vttToSrt
} from "@local-video-optimizer/video-core";
import type { JobEntity } from "../entities/job-entity.js";
import type { VideoEntity } from "../entities/video-entity.js";
import type { ProcessExecutionPolicy } from "../infrastructure/processes/process-execution-policy.js";
import type { ProcessRegistry } from "../infrastructure/processes/process-registry.js";
import type { ProcessRunner } from "../infrastructure/processes/process-runner.js";
import { BoundedTextBuffer } from "../infrastructure/processes/bounded-text-buffer.js";
import { superviseProcess } from "../infrastructure/processes/process-supervisor.js";
import type { WhisperAdapter } from "../infrastructure/tools/whisper-adapter.js";
import type { JobRepository, VideoRepository } from "../repositories/repository-types.js";
import type { CaptionPayload } from "../runtime/api-runtime.js";
import type { JobScheduler } from "../scheduling/job-scheduler.js";
import type { CleanupService } from "./cleanup-service.js";
import { buildMuxSubtitleArgs, type JobExecutor } from "./job-execution-service.js";
import type { JobLifecycle } from "./job-lifecycle-service.js";
import type { JobService } from "./job-service.js";
import type { StatePersistenceService } from "./state-persistence-service.js";
import { commandPreview, commandPreviewFor } from "./helpers/command-preview.js";

export class CaptionService {
  constructor(
    private readonly videos: VideoRepository,
    private readonly jobs: JobRepository,
    private readonly processRunner: ProcessRunner,
    private readonly processRegistry: ProcessRegistry,
    private readonly whisperAdapter: WhisperAdapter,
    private readonly persistence: StatePersistenceService,
    private readonly cleanup: CleanupService,
    private readonly execution: JobExecutor,
    private readonly jobService: JobService,
    private readonly outputDir: string,
    private readonly tmpDir: string,
    private readonly whisperModel: string | undefined,
    private readonly scheduler: JobScheduler,
    private readonly lifecycle: JobLifecycle,
    private readonly mediaPolicy: ProcessExecutionPolicy
  ) {}

  createSubtitleJob(videoId: string): { status: 200 | 202 | 400 | 404; job?: JobDto; error?: string } {
    const video = this.videos.get(videoId);
    if (!video) return { status: 404, error: "Video not found" };
    if (video.metadata.trackCounts.audio === 0) {
      return { status: 400, error: "No audio track found. Subtitles cannot be generated." };
    }
    const existing = this.jobs
      .getAll()
      .find(
        (job) =>
          job.videoId === video.id &&
          job.kind === "subtitle" &&
          (job.status === "queued" || job.status === "running" || job.status === "completed") &&
          (!job.outputPath || job.status !== "completed" || fs.existsSync(job.outputPath))
      );
    if (existing)
      return { status: existing.status === "completed" ? 200 : 202, job: this.jobService.publicJob(existing) };
    const job = this.createSubtitleEntity(video);
    this.enqueueMediaJob(job, () => this.runSubtitleJob(job, video.storedPath));
    return { status: 202, job: this.jobService.publicJob(job) };
  }

  async getCaptions(id: string): Promise<CaptionPayload | undefined> {
    const job = this.jobs.get(id);
    if (!job || job.kind !== "subtitle" || job.status !== "completed" || !job.outputPath) return undefined;
    const vtt = await fs.promises.readFile(job.outputPath, "utf8");
    const srt =
      job.sidecarPath && fs.existsSync(job.sidecarPath)
        ? await fs.promises.readFile(job.sidecarPath, "utf8")
        : vttToSrt(vtt);
    return { vtt, srt };
  }

  async updateCaptions(id: string, rawVtt: string): Promise<JobDto | undefined> {
    const job = this.jobs.get(id);
    if (!job || job.kind !== "subtitle" || job.status !== "completed" || !job.outputPath) return undefined;
    const vtt = rawVtt.trim();
    assertLooksLikeVtt(vtt);
    const finalVtt = /^WEBVTT\b/i.test(vtt) ? `${vtt}\n` : `WEBVTT\n\n${vtt}\n`;
    await fs.promises.writeFile(job.outputPath, finalVtt);
    if (job.sidecarPath) {
      await fs.promises.writeFile(job.sidecarPath, vttToSrt(finalVtt));
    }
    job.outputSize = (await stat(job.outputPath)).size;
    job.message = "Captions edited";
    await this.persistence.save();
    return this.jobService.publicJob(job);
  }

  createMuxSubtitleJob(
    videoJobId: string,
    subtitleJobId: string
  ): { status: 202 | 400 | 404; job?: JobDto; error?: string } {
    const videoJob = this.jobs.get(videoJobId);
    const subtitleJob = this.jobs.get(subtitleJobId);
    const video = videoJob ? this.videos.get(videoJob.videoId) : undefined;
    if (
      !videoJob ||
      !video ||
      videoJob.status !== "completed" ||
      !videoJob.outputPath ||
      (videoJob.kind !== "encode" && videoJob.kind !== "mux")
    ) {
      return { status: 404, error: "Completed video output not found" };
    }
    if (
      !subtitleJob ||
      subtitleJob.videoId !== videoJob.videoId ||
      subtitleJob.kind !== "subtitle" ||
      subtitleJob.status !== "completed" ||
      !subtitleJob.outputPath
    ) {
      return { status: 400, error: "Completed subtitle output not found" };
    }

    const job = this.createMuxEntity(video, videoJob, subtitleJob);
    this.enqueueMediaJob(job, () => this.execution.runMux(job, videoJob, subtitleJob));
    return { status: 202, job: this.jobService.publicJob(job) };
  }

  async detectLeadingSilence(
    inputPath: string,
    jobId?: string,
    policy: ProcessExecutionPolicy = this.mediaPolicy
  ): Promise<number> {
    const args = [
      "-hide_banner",
      "-nostats",
      "-i",
      inputPath,
      "-af",
      "silencedetect=noise=-35dB:d=0.35",
      "-f",
      "null",
      "-"
    ];
    const child = this.processRunner.spawn("ffmpeg", args, { windowsHide: true });
    if (jobId) this.processRegistry.set(jobId, child);
    const stderr = new BoundedTextBuffer(policy.maxCapturedOutputBytes, "tail");
    const supervisor = superviseProcess(child, "ffmpeg", policy);

    child.stderr?.on("data", (chunk) => stderr.append(chunk));
    const result = await supervisor.promise;
    if (jobId) this.processRegistry.delete(jobId);
    if (result.kind === "timeout") throw result.error;
    if (result.kind === "error") return 0;

    const text = stderr.toString();
    const firstStart = text.match(/silence_start:\s*([0-9.]+)/);
    const firstEnd = text.match(/silence_end:\s*([0-9.]+)/);
    const silenceStart = firstStart ? Number(firstStart[1]) : undefined;
    const silenceEnd = firstEnd ? Number(firstEnd[1]) : undefined;
    if (silenceStart !== undefined && silenceStart <= 0.25 && silenceEnd !== undefined && Number.isFinite(silenceEnd)) {
      return Math.max(0, Math.round(silenceEnd * 1000) / 1000);
    }
    return 0;
  }

  private createSubtitleEntity(video: VideoEntity): JobEntity {
    const jobId = nanoid();
    const baseName = sanitizeFileName(`${path.parse(video.originalName).name}-captions`);
    const outputFileName = `${baseName}.vtt`;
    const sidecarFileName = `${baseName}.srt`;
    const outputBasePath = path.join(this.outputDir, `${jobId}-${baseName}`);
    const outputPath = `${outputBasePath}.vtt`;
    const sidecarPath = `${outputBasePath}.srt`;
    const settings = normalizeOptimizationSettings({ outputFilename: baseName });
    const job: JobEntity = {
      id: jobId,
      videoId: video.id,
      status: "queued",
      kind: "subtitle",
      progress: 0,
      outputPath,
      outputFileName,
      sidecarPath,
      sidecarFileName,
      ffmpegCommand: "",
      startedAt: new Date().toISOString(),
      settings
    };

    this.jobs.set(job);
    this.persistence.scheduleSave();
    return job;
  }

  private createMuxEntity(video: VideoEntity, videoJob: JobEntity, subtitleJob: JobEntity): JobEntity {
    const jobId = nanoid();
    const parsed = path.parse(videoJob.outputFileName ?? video.originalName);
    const extension = parsed.ext || (videoJob.settings.outputContainer === "webm" ? ".webm" : ".mp4");
    const baseName = sanitizeFileName(`${parsed.name || path.parse(video.originalName).name}-captioned`);
    const outputFileName = `${baseName}${extension}`;
    const outputPath = path.join(this.outputDir, `${jobId}-${outputFileName}`);
    const settings = normalizeOptimizationSettings({ ...videoJob.settings, outputFilename: baseName });
    const args = buildMuxSubtitleArgs(
      videoJob.outputPath!,
      subtitleJob.outputPath!,
      outputPath,
      settings.outputContainer
    );
    const job: JobEntity = {
      id: jobId,
      videoId: video.id,
      status: "queued",
      kind: "mux",
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

  private async runSubtitleJob(job: JobEntity, inputPath: string): Promise<void> {
    if (!this.lifecycle.start(job, "Checking leading silence")) return;
    const workflowStartedAt = Date.now();
    const remainingPolicy = (): ProcessExecutionPolicy => ({
      ...this.mediaPolicy,
      timeoutMs: Math.max(1, this.mediaPolicy.timeoutMs - (Date.now() - workflowStartedAt))
    });

    const whisperCommand = await this.whisperAdapter.resolveCommand();
    const whisperModel = this.whisperModel;
    const audioPath = path.join(this.tmpDir, `${job.id}-subtitle.wav`);
    const outputBasePath = job.outputPath!.replace(/\.vtt$/i, "");

    job.progress = 3;
    await this.persistence.save();

    if (!whisperCommand) {
      this.lifecycle.fail(job, "whisper.cpp executable was not found. Set WHISPER_CPP_BIN or add whisper-cli to PATH.");
      await this.cleanup.removeJobArtifacts(job);
      await this.persistence.save();
      return;
    }

    if (!whisperModel) {
      this.lifecycle.fail(job, "WHISPER_CPP_MODEL is not configured");
      await this.cleanup.removeJobArtifacts(job);
      await this.persistence.save();
      return;
    }

    let leadingSilenceSeconds = 0;
    try {
      leadingSilenceSeconds = await this.detectLeadingSilence(inputPath, job.id, remainingPolicy());
    } catch {
      if (this.lifecycle.fail(job, `Media processing timed out after ${this.mediaPolicy.timeoutMs} ms`)) {
        await fs.promises.rm(audioPath, { force: true });
        await this.cleanup.removeJobArtifacts(job);
        await this.persistence.save();
      }
      return;
    }
    if (job.status === "canceled" || !this.jobs.get(job.id)) {
      job.progress = 0;
      job.completedAt = new Date().toISOString();
      await this.persistence.save();
      return;
    }
    const extractArgs = [
      "-y",
      ...(leadingSilenceSeconds > 0 ? ["-ss", String(leadingSilenceSeconds)] : []),
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      audioPath
    ];
    const whisperArgs = ["-m", whisperModel, "-f", audioPath, "-osrt", "-ovtt", "-of", outputBasePath];

    job.progress = 8;
    job.message =
      leadingSilenceSeconds > 0
        ? `Detected ${leadingSilenceSeconds.toFixed(2)}s leading silence`
        : "Extracting audio for subtitles";
    job.ffmpegCommand = `${commandPreview(extractArgs)} && ${commandPreviewFor(whisperCommand, whisperArgs)}`;
    this.persistence.scheduleSave();

    await new Promise<void>((resolve) => {
      let settled = false;
      let extractionFinished = false;
      const settle = async (handler: () => Promise<void>) => {
        if (settled) return;
        settled = true;
        this.processRegistry.delete(job.id);
        try {
          await handler();
        } finally {
          resolve();
        }
      };

      const extractor = this.processRunner.spawn("ffmpeg", extractArgs, { windowsHide: true });
      this.processRegistry.set(job.id, extractor);
      const extractorSupervisor = superviseProcess(extractor, "ffmpeg", remainingPolicy(), {
        onForceSettle: () => console.warn(`Force-settled timed-out subtitle extraction for job ${job.id}`)
      });

      void extractorSupervisor.promise.then((result) => {
        if (extractionFinished) return;
        if (result.kind === "error") {
          const error = result.error;
          void settle(async () => {
            if (this.lifecycle.fail(job, error.message)) {
              await this.cleanup.removeJobArtifacts(job);
              await this.persistence.save();
            }
          });
          return;
        }
        if (result.kind === "timeout") {
          void settle(async () => {
            if (job.status === "canceled") {
              job.progress = 0;
              await fs.promises.rm(audioPath, { force: true });
              await this.persistence.save();
              return;
            }
            if (this.lifecycle.fail(job, `Media processing timed out after ${this.mediaPolicy.timeoutMs} ms`)) {
              await fs.promises.rm(audioPath, { force: true });
              await this.cleanup.removeJobArtifacts(job);
              await this.persistence.save();
            }
          });
          return;
        }
        const code = result.code;
        extractionFinished = true;
        this.processRegistry.delete(job.id);
        if (job.status === "canceled") {
          void settle(async () => {
            job.progress = 0;
            await fs.promises.rm(audioPath, { force: true });
            await this.persistence.save();
          });
          return;
        }
        if (code !== 0) {
          void settle(async () => {
            if (this.lifecycle.fail(job, `Audio extraction exited with code ${code}`)) {
              await this.cleanup.removeJobArtifacts(job);
              await this.persistence.save();
            }
          });
          return;
        }

        this.lifecycle.updateProgress(job, 35, "Transcribing speech with whisper.cpp");
        const whisper = this.processRunner.spawn(whisperCommand, whisperArgs, { windowsHide: true });
        this.processRegistry.set(job.id, whisper);
        const whisperSupervisor = superviseProcess(whisper, whisperCommand, remainingPolicy(), {
          onForceSettle: () => console.warn(`Force-settled timed-out Whisper process for job ${job.id}`)
        });

        whisper.stderr?.on("data", (chunk) => {
          const text = String(chunk).trim();
          if (text && job.status === "running") {
            job.message = text.split("\n").at(-1)?.slice(0, 220) || job.message;
          }
        });

        void whisperSupervisor.promise.then((whisperResult) => {
          void settle(async () => {
            await fs.promises.rm(audioPath, { force: true });
            if (whisperResult.kind === "timeout") {
              if (job.status === "canceled") {
                job.progress = 0;
                await this.persistence.save();
                return;
              }
              if (this.lifecycle.fail(job, `Media processing timed out after ${this.mediaPolicy.timeoutMs} ms`)) {
                await this.cleanup.removeJobArtifacts(job);
                await this.persistence.save();
              }
              return;
            }
            if (whisperResult.kind === "error") {
              if (this.lifecycle.fail(job, whisperResult.error.message)) {
                await this.cleanup.removeJobArtifacts(job);
                await this.persistence.save();
              }
              return;
            }
            if (job.status === "canceled") {
              job.progress = 0;
              await this.persistence.save();
              return;
            }
            const whisperCode = whisperResult.code;
            if (whisperCode !== 0) {
              if (this.lifecycle.fail(job, `whisper.cpp exited with code ${whisperCode}`)) {
                await this.cleanup.removeJobArtifacts(job);
                await this.persistence.save();
              }
              return;
            }
            if (!fs.existsSync(job.outputPath!)) {
              if (this.lifecycle.fail(job, "whisper.cpp did not create a VTT file")) {
                await this.cleanup.removeJobArtifacts(job);
                await this.persistence.save();
              }
              return;
            }

            if (leadingSilenceSeconds > 0) {
              const vtt = await fs.promises.readFile(job.outputPath!, "utf8");
              await fs.promises.writeFile(job.outputPath!, shiftCaptionTimings(vtt, leadingSilenceSeconds));
              if (job.sidecarPath && fs.existsSync(job.sidecarPath)) {
                const srt = await fs.promises.readFile(job.sidecarPath, "utf8");
                await fs.promises.writeFile(job.sidecarPath, shiftCaptionTimings(srt, leadingSilenceSeconds));
              }
            }

            const message =
              leadingSilenceSeconds > 0
                ? `Subtitles generated with ${leadingSilenceSeconds.toFixed(2)}s leading-silence compensation`
                : "Subtitles generated";
            if (this.lifecycle.complete(job, message)) {
              job.outputSize = (await stat(job.outputPath!)).size;
              await this.persistence.save();
            }
          });
        });
      });
    });
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
