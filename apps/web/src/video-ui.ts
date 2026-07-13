export type VideoMetadata = {
  fileName: string;
  fileSize: number;
  durationSeconds: number;
  container: string;
  formatLongName?: string;
  videoCodec?: string;
  audioCodec?: string;
  trackCounts: { video: number; audio: number; subtitle: number };
  width?: number;
  height?: number;
  displayAspectRatio?: string;
  frameRate?: number;
  overallBitrate?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  audioSampleRate?: number;
  audioChannels?: number;
  pixelFormat?: string;
  color?: { space?: string; transfer?: string; primaries?: string };
  rotation?: string;
  tags?: Record<string, string>;
  webFriendly: boolean;
  warnings: string[];
};

export type Settings = {
  outputContainer: "mp4" | "webm";
  videoCodec: "libx264" | "libaom-av1" | "libvpx-vp9";
  audioCodec: "aac" | "libopus";
  width?: number;
  height?: number;
  crf: number;
  preset: "veryfast" | "fast" | "medium" | "slow";
  cpuUsed: number;
  rowMt: boolean;
  frameRate?: number;
  audioMode: "keep" | "compress" | "remove";
  audioBitrateKbps: number;
  audioSampleRate?: number;
  audioChannels?: number;
  fastStart: boolean;
  stripMetadata: boolean;
  outputFilename: string;
};

export type Recommendation = {
  tone: "good" | "warn" | "info";
  text: string;
};

export function estimateOutputSize(
  metadata: VideoMetadata,
  settings: Settings
): { bytes?: number; note: string; reduction?: number } {
  if (!metadata.durationSeconds) {
    return { note: "Estimate unavailable until duration is known." };
  }

  const sourceBitrate = metadata.overallBitrate ?? 0;
  const qualityFactor = Math.max(0.28, Math.min(0.95, 1 - (settings.crf - 18) * 0.045));
  const scaleFactor = settings.width && metadata.width ? Math.min(1, settings.width / metadata.width) : 1;
  const frameFactor =
    settings.frameRate && metadata.frameRate ? Math.min(1, settings.frameRate / metadata.frameRate) : 1;
  const audioBitrate = settings.audioMode === "remove" ? 0 : settings.audioBitrateKbps * 1000;
  const videoBitrate = Math.max(
    180_000,
    sourceBitrate * qualityFactor * scaleFactor * frameFactor - (metadata.audioBitrate ?? 0)
  );
  const bytes = ((videoBitrate + audioBitrate) * metadata.durationSeconds) / 8;
  const reduction = metadata.fileSize ? Math.round((1 - bytes / metadata.fileSize) * 100) : undefined;

  return {
    bytes,
    reduction,
    note: "Approximate CRF estimate. Actual size depends on motion, detail, grain, and encoder decisions."
  };
}

export function buildRecommendations(
  metadata: VideoMetadata,
  settings: Settings,
  estimate?: { bytes?: number; reduction?: number }
): Recommendation[] {
  const items: Recommendation[] = [];
  const megapixels = metadata.width && metadata.height ? (metadata.width * metadata.height) / 1_000_000 : 0;

  if (settings.outputContainer === "mp4" && settings.videoCodec !== "libx264") {
    items.push({
      tone: "warn",
      text: "Use MP4/H.264 as your fallback export. AV1 in MP4 is useful in some cases, but H.264 still has the broadest support."
    });
  }
  if (settings.outputContainer === "webm" && settings.videoCodec === "libx264") {
    items.push({ tone: "warn", text: "WebM should use AV1 or VP9. H.264 belongs in MP4 for normal website delivery." });
  }
  if (settings.outputContainer === "mp4" && settings.audioCodec !== "aac" && settings.audioMode !== "remove") {
    items.push({ tone: "warn", text: "MP4 web exports should normally use AAC audio. Opus is a better fit for WebM." });
  }
  if (settings.outputContainer === "webm" && settings.audioCodec !== "libopus" && settings.audioMode !== "remove") {
    items.push({
      tone: "warn",
      text: "WebM exports should normally use Opus audio for browser compatibility and compression."
    });
  }
  if (metadata.fileSize > 5_000_000 && estimate?.bytes && estimate.bytes < metadata.fileSize) {
    items.push({
      tone: "good",
      text: `This export is estimated to save about ${estimate.reduction}% versus the original.`
    });
  }
  if ((metadata.overallBitrate ?? 0) > 8_000_000) {
    items.push({
      tone: "info",
      text: "The source bitrate is high for many web pages. Resizing, lowering fps, or raising CRF should help page speed."
    });
  }
  if (megapixels > 2.2 && !settings.width) {
    items.push({
      tone: "info",
      text: "The source is larger than 1080p. Consider 1280px or 1920px width unless the video is meant to be inspected full-screen."
    });
  }
  if ((metadata.frameRate ?? 0) > 30 && !settings.frameRate) {
    items.push({
      tone: "info",
      text: "High frame-rate video can be heavy. For hero or product sections, 24 or 30 fps is often enough."
    });
  }
  if (settings.audioMode !== "remove" && metadata.trackCounts.audio === 0) {
    items.push({ tone: "info", text: "This source has no audio track, so audio settings will not affect the output." });
  }
  if (settings.audioMode !== "remove" && settings.audioBitrateKbps > 160) {
    items.push({
      tone: "info",
      text: "Audio above 160 kbps rarely matters for typical website video. Lower it first if file size is the priority."
    });
  }
  if (settings.fastStart && settings.outputContainer === "mp4") {
    items.push({ tone: "good", text: "Fast-start is enabled, which helps MP4 playback begin sooner on web pages." });
  }

  if (items.length === 0) {
    items.push({ tone: "good", text: "These settings look reasonable for a web export." });
  }

  return items;
}

export function normalizeOutputContainerChange(
  current: Settings,
  outputContainer: Settings["outputContainer"]
): Settings {
  return {
    ...current,
    outputContainer,
    videoCodec: outputContainer === "webm" && current.videoCodec === "libx264" ? "libaom-av1" : current.videoCodec,
    audioCodec: outputContainer === "webm" ? "libopus" : "aac",
    fastStart: outputContainer === "mp4" ? current.fastStart : false
  };
}

export function normalizeVideoCodecChange(current: Settings, videoCodec: Settings["videoCodec"]): Settings {
  return {
    ...current,
    videoCodec,
    outputContainer: videoCodec === "libvpx-vp9" ? "webm" : current.outputContainer,
    audioCodec: videoCodec === "libvpx-vp9" ? "libopus" : current.audioCodec
  };
}
