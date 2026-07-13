import type { OptimizationSettings } from "@local-video-optimizer/contracts";

export function normalizeOptimizationSettings(settings: Partial<OptimizationSettings>): OptimizationSettings {
  let outputContainer = settings.outputContainer ?? "mp4";
  let videoCodec = settings.videoCodec ?? (outputContainer === "webm" ? "libaom-av1" : "libx264");

  if (outputContainer === "webm" && videoCodec === "libx264") {
    videoCodec = "libaom-av1";
  }
  if (videoCodec === "libvpx-vp9") {
    outputContainer = "webm";
  }

  const audioCodec = settings.audioCodec ?? (outputContainer === "webm" ? "libopus" : "aac");

  return {
    outputContainer,
    videoCodec,
    audioCodec:
      outputContainer === "webm" && audioCodec === "aac"
        ? "libopus"
        : outputContainer === "mp4" && audioCodec === "libopus"
          ? "aac"
          : audioCodec,
    width: settings.width,
    height: settings.height,
    crf: Math.min(Math.max(settings.crf ?? 24, 16), 40),
    preset: settings.preset ?? "medium",
    cpuUsed: Math.min(Math.max(settings.cpuUsed ?? 5, 0), 8),
    rowMt: settings.rowMt ?? true,
    frameRate: settings.frameRate,
    audioMode: settings.audioMode ?? "compress",
    audioBitrateKbps: settings.audioBitrateKbps ?? 128,
    audioSampleRate: settings.audioSampleRate,
    audioChannels: settings.audioChannels,
    fastStart: settings.fastStart ?? true,
    stripMetadata: settings.stripMetadata ?? true,
    outputFilename: settings.outputFilename
  };
}
