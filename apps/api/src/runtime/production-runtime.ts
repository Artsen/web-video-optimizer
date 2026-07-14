import fs from "node:fs";
import { promisify } from "node:util";
import type { OptimizationSettings } from "@local-video-optimizer/contracts";
import type { ApiConfig } from "../config.js";
import { toHistorySnapshotDto } from "../dto/history-dto.js";
import { DesktopFileRevealer } from "../infrastructure/desktop/file-revealer.js";
import type { FileRevealer } from "../infrastructure/desktop/file-revealer.js";
import { InMemoryProcessRegistry } from "../infrastructure/processes/in-memory-process-registry.js";
import { NodeProcessRunner } from "../infrastructure/processes/node-process-runner.js";
import type { ProcessExecutionPolicy } from "../infrastructure/processes/process-execution-policy.js";
import type { ProcessRegistry } from "../infrastructure/processes/process-registry.js";
import type { ProcessRunner } from "../infrastructure/processes/process-runner.js";
import { createCommandRunner } from "../infrastructure/tools/command-runner.js";
import type { CommandRunner } from "../infrastructure/tools/command-runner.js";
import { ProcessFfmpegCapabilitiesAdapter } from "../infrastructure/tools/ffmpeg-capabilities-adapter.js";
import type { FfmpegCapabilitiesAdapter } from "../infrastructure/tools/ffmpeg-capabilities-adapter.js";
import { FfprobeAdapter } from "../infrastructure/tools/ffprobe-adapter.js";
import type { MediaProbe } from "../infrastructure/tools/ffprobe-adapter.js";
import { ConfigWhisperAdapter } from "../infrastructure/tools/whisper-adapter.js";
import type { WhisperAdapter } from "../infrastructure/tools/whisper-adapter.js";
import { YtDlpAdapter } from "../infrastructure/tools/yt-dlp-adapter.js";
import type { VideoDownloader } from "../infrastructure/tools/yt-dlp-adapter.js";
import { FileManifestStore } from "../persistence/file-manifest-store.js";
import type { ManifestStore } from "../persistence/manifest-store.js";
import { InMemoryJobRepository } from "../repositories/in-memory-job-repository.js";
import { InMemoryVideoRepository } from "../repositories/in-memory-video-repository.js";
import type { JobRepository, VideoRepository } from "../repositories/repository-types.js";
import { InMemoryJobScheduler } from "../scheduling/in-memory-job-scheduler.js";
import type { JobScheduler } from "../scheduling/job-scheduler.js";
import { CapabilitiesService } from "../services/capabilities-service.js";
import { CaptionService } from "../services/caption-service.js";
import { CleanupService } from "../services/cleanup-service.js";
import { JobExecutionService } from "../services/job-execution-service.js";
import { JobLifecycleService } from "../services/job-lifecycle-service.js";
import { JobService } from "../services/job-service.js";
import { PackageService } from "../services/package-service.js";
import { ManifestStatePersistenceService } from "../services/state-persistence-service.js";
import { VideoService } from "../services/video-service.js";
import type { ApiRuntime, UploadedVideoFile } from "./api-runtime.js";

const mkdir = promisify(fs.mkdir);

export interface ProductionRuntime extends ApiRuntime {
  shutdown(): Promise<void>;
}

export type ProductionRuntimeDependencies = {
  videoRepository?: VideoRepository;
  jobRepository?: JobRepository;
  manifestStore?: ManifestStore;
  processRunner?: ProcessRunner;
  processRegistry?: ProcessRegistry;
  commandRunner?: CommandRunner;
  mediaProbe?: MediaProbe;
  ffmpegCapabilitiesAdapter?: FfmpegCapabilitiesAdapter;
  whisperAdapter?: WhisperAdapter;
  videoDownloader?: VideoDownloader;
  fileRevealer?: FileRevealer;
  jobScheduler?: JobScheduler;
};

export function createProductionRuntime(
  apiConfig: ApiConfig,
  dependencies: ProductionRuntimeDependencies = {}
): ProductionRuntime {
  const processRunner = dependencies.processRunner ?? new NodeProcessRunner();
  const mediaPolicy: ProcessExecutionPolicy = {
    timeoutMs: apiConfig.mediaProcessTimeoutMs,
    terminationGracePeriodMs: apiConfig.processKillGracePeriodMs,
    maxCapturedOutputBytes: apiConfig.maxCapturedProcessOutputBytes
  };
  const toolPolicy: ProcessExecutionPolicy = {
    timeoutMs: apiConfig.toolCommandTimeoutMs,
    terminationGracePeriodMs: apiConfig.processKillGracePeriodMs,
    maxCapturedOutputBytes: apiConfig.maxCapturedProcessOutputBytes
  };
  const commandRunner = dependencies.commandRunner ?? createCommandRunner(processRunner, toolPolicy);
  const videoRepository = dependencies.videoRepository ?? new InMemoryVideoRepository();
  const jobRepository = dependencies.jobRepository ?? new InMemoryJobRepository();
  const manifestStore = dependencies.manifestStore ?? new FileManifestStore(apiConfig.manifestPath);
  const processRegistry = dependencies.processRegistry ?? new InMemoryProcessRegistry();
  const mediaProbe = dependencies.mediaProbe ?? new FfprobeAdapter(commandRunner);
  const ffmpegCapabilitiesAdapter =
    dependencies.ffmpegCapabilitiesAdapter ?? new ProcessFfmpegCapabilitiesAdapter(commandRunner);
  const whisperAdapter = dependencies.whisperAdapter ?? new ConfigWhisperAdapter(apiConfig, commandRunner);
  const videoDownloader =
    dependencies.videoDownloader ?? new YtDlpAdapter(apiConfig, commandRunner, processRunner, mediaPolicy);
  const fileRevealer = dependencies.fileRevealer ?? new DesktopFileRevealer(processRunner);
  const jobScheduler = dependencies.jobScheduler ?? new InMemoryJobScheduler(apiConfig.maxConcurrentMediaJobs);
  const jobLifecycle = new JobLifecycleService();

  const statePersistence = new ManifestStatePersistenceService(videoRepository, jobRepository, manifestStore, {
    tmpDir: apiConfig.tmpDir
  });
  const cleanupService = new CleanupService(
    videoRepository,
    jobRepository,
    processRegistry,
    statePersistence,
    {
      uploadDir: apiConfig.uploadDir,
      outputDir: apiConfig.outputDir,
      tmpDir: apiConfig.tmpDir
    },
    jobScheduler
  );
  const capabilitiesService = new CapabilitiesService(ffmpegCapabilitiesAdapter, whisperAdapter, videoDownloader);
  const videoService = new VideoService(
    videoRepository,
    jobRepository,
    mediaProbe,
    videoDownloader,
    cleanupService,
    statePersistence,
    apiConfig.uploadDir,
    apiConfig.tmpDir
  );
  const jobExecutionService = new JobExecutionService(
    processRunner,
    processRegistry,
    videoRepository,
    jobRepository,
    statePersistence,
    cleanupService,
    jobLifecycle,
    mediaPolicy
  );
  const jobService = new JobService(
    videoRepository,
    jobRepository,
    apiConfig.outputDir,
    statePersistence,
    cleanupService,
    jobExecutionService,
    fileRevealer,
    jobScheduler,
    jobLifecycle
  );
  const captionService = new CaptionService(
    videoRepository,
    jobRepository,
    processRunner,
    processRegistry,
    whisperAdapter,
    statePersistence,
    cleanupService,
    jobExecutionService,
    jobService,
    apiConfig.outputDir,
    apiConfig.tmpDir,
    apiConfig.whisperCppModel,
    jobScheduler,
    jobLifecycle,
    mediaPolicy
  );
  const packageService = new PackageService(
    videoRepository,
    jobRepository,
    apiConfig.outputDir,
    statePersistence,
    jobService
  );
  let shutdownPromise: Promise<void> | undefined;

  const cancelJobForShutdown = async (jobId: string): Promise<void> => {
    const job = jobRepository.get(jobId);
    if (!job) return;
    if (job.status === "queued" || job.status === "running") {
      jobLifecycle.cancel(job, "Canceled by API shutdown");
      job.progress = 0;
      await cleanupService.removeJobArtifacts(job);
    }
  };

  const waitForSchedulerIdleWithGrace = async (): Promise<boolean> => {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        jobScheduler.waitForIdle().then(() => true),
        new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), apiConfig.shutdownGracePeriodMs);
        })
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };

  return {
    async initialize() {
      videoRepository.clear();
      jobRepository.clear();
      processRegistry.clear();
      await Promise.all([
        mkdir(apiConfig.uploadDir, { recursive: true }),
        mkdir(apiConfig.outputDir, { recursive: true }),
        mkdir(apiConfig.tmpDir, { recursive: true })
      ]);
      const recovery = await statePersistence.load();
      await videoService.mergeDuplicateVideos();
      await cleanupService.pruneOrphanFiles();
      await statePersistence.save();
      await statePersistence.flush();
      if (
        recovery.recoveredFromBackup ||
        recovery.canceledInterruptedJobs > 0 ||
        recovery.failedMissingOutputJobs > 0 ||
        recovery.skippedDanglingJobs > 0
      ) {
        console.warn("Recovered application state:", recovery);
      }
    },
    async getCapabilities() {
      return capabilitiesService.getCapabilities();
    },
    getHistory() {
      return toHistorySnapshotDto(videoRepository.getAll(), jobRepository.getAll());
    },
    async createVideoFromUpload(file: UploadedVideoFile) {
      return videoService.createFromUpload(file);
    },
    async createVideoFromUrl(url: string) {
      return videoService.createFromUrl(url);
    },
    getVideo(id: string) {
      return videoService.get(id);
    },
    getVideoMetadata(id: string) {
      return videoService.getMetadata(id);
    },
    getVideoSource(id: string) {
      return videoService.getSource(id);
    },
    getVideoDownload(id: string) {
      return videoService.getDownload(id);
    },
    async renameVideo(id: string, originalName: string) {
      return videoService.rename(id, originalName);
    },
    async deleteVideo(id: string) {
      return videoService.delete(id);
    },
    createOptimizationJob(videoId: string, rawSettings: Partial<OptimizationSettings>) {
      return jobService.createOptimizationJob(videoId, rawSettings);
    },
    createSampleJob(videoId: string, rawSettings: Partial<OptimizationSettings>, rawSampleSeconds?: unknown) {
      return jobService.createSampleJob(videoId, rawSettings, rawSampleSeconds);
    },
    createPosterJob(videoId: string, rawAtSeconds?: unknown) {
      return jobService.createPosterJob(videoId, rawAtSeconds);
    },
    createSubtitleJob(videoId: string) {
      return captionService.createSubtitleJob(videoId);
    },
    createPairJobs(videoId: string) {
      return jobService.createPairJobs(videoId);
    },
    async createPackageJob(videoId: string, body: unknown) {
      return packageService.createPackageJob(videoId, body);
    },
    async deleteHistory(videoIds: string[], jobIds: string[]) {
      await cleanupService.deleteHistory(videoIds, jobIds);
      return toHistorySnapshotDto(videoRepository.getAll(), jobRepository.getAll());
    },
    getJob(id: string) {
      return jobService.get(id);
    },
    async renameJob(id: string, outputFileName: string) {
      return jobService.rename(id, outputFileName);
    },
    async cancelJob(id: string) {
      return jobService.cancel(id);
    },
    getJobDownload(id: string) {
      return jobService.getDownload(id);
    },
    getJobSidecar(id: string) {
      return jobService.getSidecar(id);
    },
    getJobOutput(id: string) {
      return jobService.getOutput(id);
    },
    async getCaptions(id: string) {
      return captionService.getCaptions(id);
    },
    async updateCaptions(id: string, vtt: string) {
      return captionService.updateCaptions(id, vtt);
    },
    createMuxSubtitleJob(videoJobId: string, subtitleJobId: string) {
      return captionService.createMuxSubtitleJob(videoJobId, subtitleJobId);
    },
    async revealJob(id: string) {
      return jobService.reveal(id);
    },
    async deleteJob(id: string) {
      return jobService.delete(id);
    },
    shutdown() {
      shutdownPromise ??= (async () => {
        jobScheduler.stopAccepting();
        const canceledQueuedIds = jobScheduler.cancelAllQueued();
        await Promise.all(canceledQueuedIds.map((jobId) => cancelJobForShutdown(jobId)));

        for (const jobId of jobScheduler.getSnapshot().runningJobIds) {
          await cancelJobForShutdown(jobId);
        }

        for (const [, process] of processRegistry.entries()) {
          process.kill("SIGTERM");
        }

        const idle = await waitForSchedulerIdleWithGrace();
        if (!idle) {
          for (const [jobId, process] of processRegistry.entries()) {
            console.warn(`Forcing media process termination for job ${jobId}`);
            process.kill("SIGKILL");
            processRegistry.delete(jobId);
          }
        }

        for (const job of jobRepository.getAll()) {
          if (job.status === "canceled") {
            await cleanupService.removeJobArtifacts(job);
          }
        }

        await statePersistence.save();
        await statePersistence.flush();
      })();
      return shutdownPromise;
    }
  };
}
