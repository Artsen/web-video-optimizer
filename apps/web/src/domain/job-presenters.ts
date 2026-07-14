import type { JobDto, OptimizationSettings } from "@local-video-optimizer/contracts";
import { formatBytes } from "./formatters";

export function codecLabel(codec: OptimizationSettings["videoCodec"]): string {
  if (codec === "libx264") return "H.264";
  if (codec === "libaom-av1") return "AV1";
  return "VP9";
}

export function qualityLabel(settings: OptimizationSettings): string {
  if (settings.videoCodec === "libx264") {
    if (settings.crf <= 20) return "High quality";
    if (settings.crf <= 25) return "Balanced";
    if (settings.crf <= 30) return "Small file";
    return "Aggressive compression";
  }

  if (settings.crf <= 28) return "High quality";
  if (settings.crf <= 34) return "Balanced modern";
  if (settings.crf <= 38) return "Small modern file";
  return "Aggressive compression";
}

export function fileSizeDelta(outputSize: number | undefined, originalSize: number): string {
  if (!outputSize || !originalSize) return "Unknown";
  const reduction = Math.round((1 - outputSize / originalSize) * 100);
  if (reduction > 0) return `${reduction}% smaller`;
  if (reduction < 0) return `${Math.abs(reduction)}% larger`;
  return "Same size";
}

export function nextExportSuggestion(settings: OptimizationSettings): string {
  if (settings.outputContainer === "webm" || settings.videoCodec !== "libx264") {
    return "Also create an MP4/H.264 fallback for older browsers and broad Safari coverage.";
  }

  return "This is a solid fallback. Add an AV1/WebM export if you want a smaller modern-browser source.";
}

export function buildVideoMarkup(job: JobDto, settings: OptimizationSettings): string {
  const fileName = job.outputFileName ?? `optimized-video.${settings.outputContainer}`;
  const type = settings.outputContainer === "webm" ? "video/webm" : "video/mp4";
  const attributes =
    settings.audioMode === "remove"
      ? 'autoplay muted loop playsinline preload="metadata"'
      : 'controls preload="metadata"';

  return `<video ${attributes} poster="poster.webp">
  <source src="${fileName}" type="${type}">
</video>`;
}

export function variationLabel(job: JobDto): string {
  if (job.kind === "encode" || job.kind === "mux")
    return `${job.settings.outputContainer.toUpperCase()} / ${codecLabel(job.settings.videoCodec)}`;
  if (job.kind === "sample") return "Sample estimate";
  if (job.kind === "poster") return "Poster image";
  if (job.kind === "subtitle") return "WebVTT + SRT captions";
  return "Web package";
}

export function jobTitle(job: JobDto): string {
  if (job.kind === "encode" && job.settings.outputContainer === "mp4" && job.settings.videoCodec === "libx264")
    return "MP4 fallback";
  if (job.kind === "encode" && job.settings.outputContainer === "webm" && job.settings.videoCodec === "libaom-av1")
    return "Modern AV1";
  if (job.kind === "encode" && job.settings.outputContainer === "webm") return "Modern WebM";
  if (job.kind === "encode" && job.settings.videoCodec !== "libx264") return "Modern MP4";
  if (job.kind === "encode") return "Custom export";
  if (job.kind === "mux") return "Captioned video";
  if (job.kind === "poster") return "WebP poster";
  if (job.kind === "subtitle") return "Captions + transcript";
  if (job.kind === "sample") return "5-second sample";
  return "Website package";
}

export function packageItemClass(done: boolean): string {
  return done ? "package-checklist-item good" : "package-checklist-item warn";
}

export function variationDetails(job: JobDto): string {
  if (job.kind === "mux") return "Video output with an embedded subtitle track";
  if (job.kind === "encode") {
    const dimensions = job.settings.width ? `${job.settings.width}px wide` : "source size";
    const frameRate = job.settings.frameRate ? `${job.settings.frameRate} fps` : "source fps";
    const audio =
      job.settings.audioMode === "remove" ? "no audio" : `${job.settings.audioCodec === "aac" ? "AAC" : "Opus"} audio`;
    return `${dimensions} / ${frameRate} / CRF ${job.settings.crf} / ${audio}`;
  }
  if (job.kind === "sample" && job.sampleEstimate) {
    return `Projects ${formatBytes(job.sampleEstimate.estimatedFullSize)} full-size output`;
  }
  if (job.kind === "poster") return "Generated from the selected source frame";
  if (job.kind === "subtitle") return "Generated captions for accessible web playback";
  return "ZIP bundle for website handoff";
}

export function variationBadges(job: JobDto, bestSavingsJobId?: string): string[] {
  const badges: string[] = [];
  if (
    (job.kind === "encode" || job.kind === "mux") &&
    job.settings.outputContainer === "mp4" &&
    job.settings.videoCodec === "libx264"
  )
    badges.push("Best fallback");
  if (
    (job.kind === "encode" || job.kind === "mux") &&
    (job.settings.outputContainer === "webm" || job.settings.videoCodec !== "libx264")
  )
    badges.push("Modern source");
  if ((job.kind === "encode" || job.kind === "mux") && job.settings.audioMode === "remove")
    badges.push("Silent loop ready");
  if (job.kind === "mux") badges.push("Embedded captions");
  if (bestSavingsJobId === job.id) badges.push("Smallest export");
  if (job.kind === "poster") badges.push("SEO/helper asset");
  if (job.kind === "subtitle") badges.push("Accessibility");
  if (job.kind === "package") badges.push("Handoff ZIP");
  return badges;
}

export function describeMediaError(video: HTMLVideoElement | null): string {
  const error = video?.error;
  if (!error) return "Media could not be loaded.";
  if (error.code === MediaError.MEDIA_ERR_NETWORK) return "Media request failed while loading this output.";
  if (error.code === MediaError.MEDIA_ERR_DECODE) return "Media loaded, but this browser could not decode it.";
  if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return "This browser cannot preview this output format or codec.";
  }
  if (error.code === MediaError.MEDIA_ERR_ABORTED) return "Media loading was aborted.";
  return error.message || "Media could not be loaded.";
}
