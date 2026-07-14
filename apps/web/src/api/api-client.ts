import type {
  Capabilities,
  HistorySnapshot,
  JobDto,
  OptimizationSettings,
  PackageMetadata,
  VideoRecordDto
} from "@local-video-optimizer/contracts";
import { parseApiError } from "./api-error";
import { apiUrl } from "./urls";

export type CaptionPayload = {
  vtt: string;
  srt?: string;
};

export type PairJobsResponse = {
  jobs: JobDto[];
};

export interface VideoOptimizerApi {
  getCapabilities(): Promise<Capabilities>;
  getHistory(): Promise<HistorySnapshot>;
  uploadVideo(file: File): Promise<VideoRecordDto>;
  importVideoUrl(url: string): Promise<VideoRecordDto>;
  renameVideo(videoId: string, originalName: string): Promise<VideoRecordDto>;
  deleteVideo(videoId: string): Promise<void>;
  createOptimizationJob(videoId: string, settings: Partial<OptimizationSettings>): Promise<JobDto>;
  createSampleJob(videoId: string, settings: Partial<OptimizationSettings>, sampleSeconds?: number): Promise<JobDto>;
  createPosterJob(videoId: string, atSeconds?: number): Promise<JobDto>;
  createPairJobs(videoId: string, compatibilitySettings?: Partial<OptimizationSettings>): Promise<PairJobsResponse>;
  createSubtitleJob(videoId: string): Promise<JobDto>;
  getCaptions(jobId: string): Promise<CaptionPayload>;
  updateCaptions(jobId: string, vtt: string): Promise<JobDto>;
  createMuxJob(videoJobId: string, subtitleJobId: string): Promise<JobDto>;
  createPackageJob(videoId: string, jobIds: string[], metadata: PackageMetadata): Promise<JobDto>;
  renameJob(jobId: string, outputFileName: string): Promise<JobDto>;
  cancelJob(jobId: string): Promise<JobDto>;
  deleteJob(jobId: string): Promise<void>;
  deleteHistory(videoIds: string[], jobIds: string[]): Promise<HistorySnapshot>;
  revealJob(jobId: string): Promise<void>;
}

type ClientOptions = {
  baseUrl: string;
  fetchFn?: typeof fetch;
};

type JsonBody = Record<string, unknown> | unknown[];

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw await parseApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function createVideoOptimizerApi({ baseUrl, fetchFn = fetch }: ClientOptions): VideoOptimizerApi {
  async function jsonRequest<T>(path: string, options: { method?: string; body?: JsonBody } = {}): Promise<T> {
    const response = await fetchFn(apiUrl(baseUrl, path), {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    return parseJsonResponse<T>(response);
  }

  return {
    getCapabilities: () => jsonRequest<Capabilities>("/api/capabilities"),
    getHistory: () => jsonRequest<HistorySnapshot>("/api/history"),
    async uploadVideo(file) {
      const body = new FormData();
      body.append("video", file);
      const response = await fetchFn(apiUrl(baseUrl, "/api/videos"), { method: "POST", body });
      return parseJsonResponse<VideoRecordDto>(response);
    },
    importVideoUrl: (url) => jsonRequest<VideoRecordDto>("/api/videos/url", { method: "POST", body: { url } }),
    renameVideo: (videoId, originalName) =>
      jsonRequest<VideoRecordDto>(`/api/videos/${videoId}`, { method: "PATCH", body: { originalName } }),
    deleteVideo: (videoId) => jsonRequest<void>(`/api/videos/${videoId}`, { method: "DELETE" }),
    createOptimizationJob: (videoId, settings) =>
      jsonRequest<JobDto>(`/api/videos/${videoId}/jobs`, { method: "POST", body: settings }),
    createSampleJob: (videoId, settings, sampleSeconds) =>
      jsonRequest<JobDto>(`/api/videos/${videoId}/sample`, {
        method: "POST",
        body: { ...settings, ...(sampleSeconds === undefined ? {} : { sampleSeconds }) }
      }),
    createPosterJob: (videoId, atSeconds) =>
      jsonRequest<JobDto>(`/api/videos/${videoId}/poster`, {
        method: "POST",
        body: atSeconds === undefined ? {} : { atSeconds }
      }),
    createPairJobs: (videoId, compatibilitySettings = {}) =>
      jsonRequest<PairJobsResponse>(`/api/videos/${videoId}/pair`, { method: "POST", body: compatibilitySettings }),
    createSubtitleJob: (videoId) => jsonRequest<JobDto>(`/api/videos/${videoId}/subtitles`, { method: "POST" }),
    getCaptions: (jobId) => jsonRequest<CaptionPayload>(`/api/jobs/${jobId}/captions`),
    updateCaptions: (jobId, vtt) =>
      jsonRequest<JobDto>(`/api/jobs/${jobId}/captions`, { method: "PUT", body: { vtt } }),
    createMuxJob: (videoJobId, subtitleJobId) =>
      jsonRequest<JobDto>(`/api/jobs/${videoJobId}/mux-subtitles`, { method: "POST", body: { subtitleJobId } }),
    createPackageJob: (videoId, jobIds, metadata) =>
      jsonRequest<JobDto>(`/api/videos/${videoId}/package`, { method: "POST", body: { jobIds, metadata } }),
    renameJob: (jobId, outputFileName) =>
      jsonRequest<JobDto>(`/api/jobs/${jobId}`, { method: "PATCH", body: { outputFileName } }),
    cancelJob: (jobId) => jsonRequest<JobDto>(`/api/jobs/${jobId}/cancel`, { method: "POST" }),
    deleteJob: (jobId) => jsonRequest<void>(`/api/jobs/${jobId}`, { method: "DELETE" }),
    deleteHistory: (videoIds, jobIds) =>
      jsonRequest<HistorySnapshot>("/api/history/delete", { method: "POST", body: { videoIds, jobIds } }),
    revealJob: (jobId) => jsonRequest<void>(`/api/jobs/${jobId}/reveal`, { method: "POST" })
  };
}
