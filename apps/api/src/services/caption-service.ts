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
import type { ProcessRegistry } from "../infrastructure/processes/process-registry.js";
import type { ProcessRunner } from "../infrastructure/processes/process-runner.js";
import type { WhisperAdapter } from "../infrastructure/tools/whisper-adapter.js";
import type { JobRepository, VideoRepository } from "../repositories/repository-types.js";
import type { CaptionPayload } from "../runtime/api-runtime.js";
import type { CleanupService } from "./cleanup-service.js";
import { buildMuxSubtitleArgs, type JobExecutor } from "./job-execution-service.js";
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
    private readonly whisperModel?: string
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
    void this.runSubtitleJob(job, video.storedPath);
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
    this.execution.runMux(job, videoJob, subtitleJob);
    return { status: 202, job: this.jobService.publicJob(job) };
  }

  detectLeadingSilence(inputPath: string): Promise<number> {
    return new Promise((resolve) => {
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
      const child = this.processRunner["spawn"]("ffmpeg", args, { windowsHide: true });
      let stderr = "";

      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", () => resolve(0));
      child.on("close", () => {
        const firstStart = stderr.match(/silence_start:\s*([0-9.]+)/);
        const firstEnd = stderr.match(/silence_end:\s*([0-9.]+)/);
        const silenceStart = firstStart ? Number(firstStart[1]) : undefined;
        const silenceEnd = firstEnd ? Number(firstEnd[1]) : undefined;
        if (
          silenceStart !== undefined &&
          silenceStart <= 0.25 &&
          silenceEnd !== undefined &&
          Number.isFinite(silenceEnd)
        ) {
          resolve(Math.max(0, Math.round(silenceEnd * 1000) / 1000));
          return;
        }
        resolve(0);
      });
    });
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
    void this.persistence.save();
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
    void this.persistence.save();
    return job;
  }

  private async runSubtitleJob(job: JobEntity, inputPath: string): Promise<void> {
    const whisperCommand = await this.whisperAdapter.resolveCommand();
    const whisperModel = this.whisperModel;
    const audioPath = path.join(this.tmpDir, `${job.id}-subtitle.wav`);
    const outputBasePath = job.outputPath!.replace(/\.vtt$/i, "");

    job.status = "running";
    job.progress = 3;
    job.message = "Checking leading silence";

    if (!whisperCommand) {
      job.status = "failed";
      job.message = "whisper.cpp executable was not found. Set WHISPER_CPP_BIN or add whisper-cli to PATH.";
      job.completedAt = new Date().toISOString();
      void this.cleanup.removeJobArtifacts(job);
      void this.persistence.save();
      return;
    }

    if (!whisperModel) {
      job.status = "failed";
      job.message = "WHISPER_CPP_MODEL is not configured";
      job.completedAt = new Date().toISOString();
      void this.cleanup.removeJobArtifacts(job);
      void this.persistence.save();
      return;
    }

    const leadingSilenceSeconds = await this.detectLeadingSilence(inputPath);
    if (this.jobs.get(job.id)?.status === "canceled") {
      job.progress = 0;
      job.message = "Canceled";
      job.completedAt = new Date().toISOString();
      void this.persistence.save();
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
    void this.persistence.save();

    const extractor = this.processRunner["spawn"]("ffmpeg", extractArgs, { windowsHide: true });
    this.processRegistry.set(job.id, extractor);

    extractor.on("error", (error) => {
      job.status = "failed";
      job.message = error.message;
      job.completedAt = new Date().toISOString();
      this.processRegistry.delete(job.id);
      void this.cleanup.removeJobArtifacts(job);
      void this.persistence.save();
    });

    extractor.on("close", (code) => {
      if (job.status === "canceled") {
        this.processRegistry.delete(job.id);
        void fs.promises.rm(audioPath, { force: true });
        void this.persistence.save();
        return;
      }
      if (code !== 0) {
        job.status = "failed";
        job.message = `Audio extraction exited with code ${code}`;
        job.completedAt = new Date().toISOString();
        this.processRegistry.delete(job.id);
        void this.cleanup.removeJobArtifacts(job);
        void this.persistence.save();
        return;
      }

      job.progress = 35;
      job.message = "Transcribing speech with whisper.cpp";
      const whisper = this.processRunner["spawn"](whisperCommand, whisperArgs, { windowsHide: true });
      this.processRegistry.set(job.id, whisper);

      whisper.stderr?.on("data", (chunk) => {
        const text = String(chunk).trim();
        if (text && job.status === "running") {
          job.message = text.split("\n").at(-1)?.slice(0, 220) || job.message;
        }
      });

      whisper.on("error", (error) => {
        job.status = "failed";
        job.message = error.message;
        job.completedAt = new Date().toISOString();
        this.processRegistry.delete(job.id);
        void fs.promises.rm(audioPath, { force: true });
        void this.cleanup.removeJobArtifacts(job);
        void this.persistence.save();
      });

      whisper.on("close", async (whisperCode) => {
        this.processRegistry.delete(job.id);
        await fs.promises.rm(audioPath, { force: true });
        job.completedAt = new Date().toISOString();
        if (job.status === "canceled") {
          job.progress = 0;
          job.message = "Canceled";
          void this.persistence.save();
          return;
        }
        if (whisperCode !== 0) {
          job.status = "failed";
          job.message = `whisper.cpp exited with code ${whisperCode}`;
          await this.cleanup.removeJobArtifacts(job);
          void this.persistence.save();
          return;
        }
        if (!fs.existsSync(job.outputPath!)) {
          job.status = "failed";
          job.message = "whisper.cpp did not create a VTT file";
          await this.cleanup.removeJobArtifacts(job);
          void this.persistence.save();
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

        job.status = "completed";
        job.progress = 100;
        job.message =
          leadingSilenceSeconds > 0
            ? `Subtitles generated with ${leadingSilenceSeconds.toFixed(2)}s leading-silence compensation`
            : "Subtitles generated";
        job.outputSize = (await stat(job.outputPath!)).size;
        void this.persistence.save();
      });
    });
  }
}
