import type {
  Capabilities,
  HistorySnapshot,
  JobDto,
  JobKind,
  OptimizationSettings,
  VideoMetadata,
  VideoRecordDto,
  StorageCleanupResultDto,
  ReadinessDto,
  StorageStatusDto
} from "@local-video-optimizer/contracts";
import type { OpenedStoredFile, StorageArea } from "../storage/storage-boundary.js";

export type UploadedVideoFile = {
  path?: string;
  originalName: string;
  buffer?: Buffer;
};

export type StreamDescriptor = {
  filePath: string;
  fileName: string;
  area?: StorageArea;
  open?: () => Promise<OpenedStoredFile>;
};

export type CaptionPayload = {
  vtt: string;
  srt: string;
};

export interface ApiRuntime {
  initialize(): Promise<void>;
  getCapabilities(): Promise<Capabilities>;
  getReadiness(): Promise<ReadinessDto>;
  getStorageStatus(): Promise<StorageStatusDto>;
  cleanupStorage(): Promise<StorageCleanupResultDto>;
  getHistory(): HistorySnapshot;
  createVideoFromUpload(file: UploadedVideoFile): Promise<VideoRecordDto>;
  createVideoFromUrl(url: string): Promise<VideoRecordDto>;
  getVideo(id: string): VideoRecordDto | undefined;
  getVideoMetadata(id: string): VideoMetadata | undefined;
  getVideoSource(id: string): StreamDescriptor | undefined;
  getVideoDownload(id: string): StreamDescriptor | undefined;
  renameVideo(id: string, originalName: string): Promise<VideoRecordDto | undefined>;
  deleteVideo(id: string): Promise<boolean>;
  createOptimizationJob(
    videoId: string,
    settings: Partial<OptimizationSettings>
  ): Promise<{ status: 200 | 202; job?: JobDto }>;
  createSampleJob(
    videoId: string,
    settings: Partial<OptimizationSettings>,
    sampleSeconds?: unknown
  ): Promise<{ status: 200 | 202; job?: JobDto }>;
  createPosterJob(videoId: string, atSeconds?: unknown): Promise<JobDto | undefined>;
  createSubtitleJob(videoId: string): Promise<{ status: 200 | 202 | 400 | 404; job?: JobDto; error?: string }>;
  createPairJobs(videoId: string): Promise<{ jobs: JobDto[] } | undefined>;
  createPackageJob(videoId: string, body: unknown): Promise<{ status: 201 | 400 | 404; job?: JobDto; error?: string }>;
  deleteHistory(videoIds: string[], jobIds: string[]): Promise<HistorySnapshot>;
  getJob(id: string): JobDto | undefined;
  renameJob(id: string, outputFileName: string): Promise<JobDto | undefined>;
  cancelJob(id: string): Promise<JobDto | undefined>;
  getJobDownload(id: string): StreamDescriptor | undefined;
  getJobSidecar(id: string): StreamDescriptor | undefined;
  getJobOutput(id: string): StreamDescriptor | undefined;
  getCaptions(id: string): Promise<CaptionPayload | undefined>;
  updateCaptions(id: string, vtt: string): Promise<JobDto | undefined>;
  createMuxSubtitleJob(
    videoJobId: string,
    subtitleJobId: string
  ): Promise<{ status: 202 | 400 | 404; job?: JobDto; error?: string }>;
  revealJob(id: string): Promise<boolean>;
  deleteJob(id: string): Promise<boolean>;
}

export type CreateJobInput = {
  videoId: string;
  settings: OptimizationSettings;
  kind: JobKind;
};
