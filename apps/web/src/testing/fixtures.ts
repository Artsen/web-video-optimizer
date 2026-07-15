import type {
  Capabilities,
  HistorySnapshot,
  JobDto,
  OptimizationSettings,
  PackageMetadata,
  StorageStatusDto,
  VideoRecordDto
} from "@local-video-optimizer/contracts";

export function settings(overrides: Partial<OptimizationSettings> = {}): OptimizationSettings {
  return {
    outputContainer: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    crf: 26,
    preset: "slow",
    cpuUsed: 5,
    rowMt: true,
    audioMode: "compress",
    audioBitrateKbps: 128,
    audioSampleRate: 48000,
    audioChannels: 2,
    frameRate: 24,
    width: 1280,
    fastStart: true,
    stripMetadata: true,
    outputFilename: "optimized-video",
    ...overrides
  };
}

export function videoRecord(overrides: Partial<VideoRecordDto> = {}): VideoRecordDto {
  return {
    id: "video-1",
    originalName: "homepage-video.mp4",
    uploadedAt: "2026-07-14T00:00:00.000Z",
    metadata: {
      fileName: "homepage-video.mp4",
      fileSize: 10_000_000,
      durationSeconds: 42,
      container: "mov,mp4,m4a,3gp,3g2,mj2",
      videoCodec: "h264",
      audioCodec: "aac",
      trackCounts: { video: 1, audio: 1, subtitle: 0 },
      width: 1920,
      height: 1080,
      frameRate: 30,
      overallBitrate: 6_000_000,
      audioBitrate: 128_000,
      pixelFormat: "yuv420p",
      webFriendly: true,
      warnings: []
    },
    ...overrides
  };
}

export function job(overrides: Partial<JobDto> = {}): JobDto {
  return {
    id: "job-1",
    videoId: "video-1",
    kind: "encode",
    status: "completed",
    progress: 100,
    settings: settings(),
    outputFileName: "homepage-video-fallback-h264.mp4",
    outputSize: 1_000_000,
    ffmpegCommand: "ffmpeg -i input.mp4 output.mp4",
    startedAt: "2026-07-14T00:00:01.000Z",
    completedAt: "2026-07-14T00:00:02.000Z",
    ...overrides
  };
}

export function capabilities(overrides: Partial<Capabilities> = {}): Capabilities {
  return {
    libx264: true,
    libaomAv1: true,
    libvpxVp9: true,
    aac: true,
    libopus: true,
    ytDlp: true,
    ytDlpCommand: "yt-dlp",
    whisperCpp: false,
    ...overrides
  };
}

export function historySnapshot(overrides: Partial<HistorySnapshot> = {}): HistorySnapshot {
  return {
    videos: [],
    jobs: [],
    ...overrides
  };
}

export function packageMetadata(overrides: Partial<PackageMetadata> = {}): PackageMetadata {
  return {
    title: "Homepage video",
    description: "Video for homepage.",
    language: "en",
    filenamePrefix: "homepage-video",
    ...overrides
  };
}

export function storageStatus(overrides: Partial<StorageStatusDto> = {}): StorageStatusDto {
  return {
    managedBytes: 1_250_000,
    reservedBytes: 0,
    availableBytes: 50_000_000,
    totalFilesystemBytes: 100_000_000,
    minimumFreeBytes: 10_000_000,
    pressure: "normal",
    areas: {
      uploads: { bytes: 10_000_000, fileCount: 1 },
      outputs: { bytes: 1_000_000, fileCount: 1 },
      temporary: { bytes: 250_000, fileCount: 1 },
      staging: { bytes: 0, fileCount: 0 }
    },
    cleanup: {
      staleTemporaryBytes: 250_000,
      staleTemporaryFileCount: 1
    },
    ...overrides
  };
}
