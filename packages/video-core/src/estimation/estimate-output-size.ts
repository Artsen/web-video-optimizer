import type { OptimizationSettings, VideoMetadata } from "@local-video-optimizer/contracts";

export type OutputSizeEstimate = {
  bytes?: number;
  note: string;
  reduction?: number;
};

export function estimateOutputSize(metadata: VideoMetadata, settings: OptimizationSettings): OutputSizeEstimate {
  if (!metadata.durationSeconds) {
    return { note: "Estimate unavailable until duration is known." };
  }

  const sourceBitrate = metadata.overallBitrate ?? 0;
  const qualityFactor = Math.max(0.28, Math.min(0.95, 1 - (settings.crf - 18) * 0.045));
  const scaleFactor = settings.width && metadata.width ? Math.min(1, settings.width / metadata.width) : 1;
  const frameFactor =
    settings.frameRate && metadata.frameRate ? Math.min(1, settings.frameRate / metadata.frameRate) : 1;
  const audioBitrate = settings.audioMode === "remove" ? 0 : (settings.audioBitrateKbps ?? 128) * 1000;
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
