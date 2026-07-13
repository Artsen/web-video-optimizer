import type { OptimizationSettings } from "@local-video-optimizer/contracts";

export function buildFfmpegArgs(
  inputPath: string,
  outputPath: string,
  settings: OptimizationSettings,
  durationLimitSeconds?: number
): string[] {
  const args = ["-y", "-i", inputPath, "-map", "0:v:0"];
  const filters: string[] = [];

  if (settings.audioMode !== "remove") {
    args.push("-map", "0:a?");
  }

  args.push("-c:v", settings.videoCodec);

  if (settings.videoCodec === "libx264") {
    args.push("-crf", String(settings.crf), "-preset", settings.preset);
  }

  if (settings.videoCodec === "libaom-av1") {
    args.push("-crf", String(settings.crf), "-b:v", "0", "-cpu-used", String(settings.cpuUsed ?? 5));
    if (settings.rowMt ?? true) args.push("-row-mt", "1");
  }

  if (settings.videoCodec === "libvpx-vp9") {
    args.push(
      "-crf",
      String(settings.crf),
      "-b:v",
      "0",
      "-deadline",
      "good",
      "-cpu-used",
      String(settings.cpuUsed ?? 3)
    );
  }

  args.push("-pix_fmt", "yuv420p");

  if (settings.width || settings.height) {
    const width = settings.width ? String(settings.width) : "-2";
    const height = settings.height ? String(settings.height) : "-2";
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
  }
  if (settings.frameRate) {
    filters.push(`fps=${settings.frameRate}`);
  }
  if (filters.length > 0) {
    args.push("-vf", filters.join(","));
  }

  if (settings.audioMode === "remove") {
    args.push("-an");
  } else {
    args.push("-c:a", settings.audioCodec);
    if (settings.audioMode === "compress" && settings.audioBitrateKbps) {
      args.push("-b:a", `${settings.audioBitrateKbps}k`);
    }
    if (settings.audioChannels) {
      args.push("-ac", String(settings.audioChannels));
    }
    if (settings.audioSampleRate) {
      args.push("-ar", String(settings.audioSampleRate));
    }
  }

  if (settings.stripMetadata) {
    args.push("-map_metadata", "-1");
  }

  if (settings.fastStart && settings.outputContainer === "mp4") {
    args.push("-movflags", "+faststart");
  }

  if (durationLimitSeconds) {
    args.push("-t", String(durationLimitSeconds));
  }

  args.push(outputPath);
  return args;
}
