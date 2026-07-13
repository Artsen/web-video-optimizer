export type FFprobeStream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  display_aspect_ratio?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
  pix_fmt?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  tags?: Record<string, string>;
  side_data_list?: Array<Record<string, unknown>>;
};

export type FFprobeResult = {
  format?: {
    filename?: string;
    format_name?: string;
    format_long_name?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
  };
  streams?: FFprobeStream[];
};

export type VideoMetadata = {
  fileName: string;
  fileSize: number;
  durationSeconds: number;
  container: string;
  formatLongName?: string;
  videoCodec?: string;
  audioCodec?: string;
  trackCounts: {
    video: number;
    audio: number;
    subtitle: number;
  };
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
  color?: {
    space?: string;
    transfer?: string;
    primaries?: string;
  };
  rotation?: string;
  tags?: Record<string, string>;
  webFriendly: boolean;
  warnings: string[];
};

export type OptimizationSettings = {
  outputContainer: "mp4" | "webm";
  videoCodec: "libx264" | "libaom-av1" | "libvpx-vp9";
  audioCodec: "aac" | "libopus";
  width?: number;
  height?: number;
  crf: number;
  preset: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow";
  cpuUsed?: number;
  rowMt?: boolean;
  frameRate?: number;
  audioMode: "keep" | "compress" | "remove";
  audioBitrateKbps?: number;
  audioSampleRate?: number;
  audioChannels?: number;
  fastStart: boolean;
  stripMetadata: boolean;
  outputFilename?: string;
};

export function parseRate(rate?: string): number | undefined {
  if (!rate || rate === "0/0") return undefined;
  const [num, den] = rate.split("/").map(Number);
  if (!Number.isFinite(num)) return undefined;
  if (!den) return num;
  return Math.round((num / den) * 100) / 100;
}

export function parseNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function analyzeWebFriendliness(metadata: Omit<VideoMetadata, "webFriendly" | "warnings">): {
  webFriendly: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  const container = metadata.container.toLowerCase();
  const videoCodec = metadata.videoCodec?.toLowerCase();
  const audioCodec = metadata.audioCodec?.toLowerCase();

  if (!container.includes("mp4") && !container.includes("webm")) {
    warnings.push("Container is not a typical web delivery format. MP4 or WebM is recommended.");
  }
  if (videoCodec && !["h264", "avc1", "vp9", "av1"].includes(videoCodec)) {
    warnings.push(`Video codec ${metadata.videoCodec} may have limited browser support.`);
  }
  if (audioCodec && !["aac", "opus", "mp3"].includes(audioCodec)) {
    warnings.push(`Audio codec ${metadata.audioCodec} may have limited browser support.`);
  }
  if (metadata.pixelFormat && metadata.pixelFormat !== "yuv420p") {
    warnings.push(`Pixel format ${metadata.pixelFormat} may not play reliably in all browsers.`);
  }
  if (metadata.overallBitrate && metadata.overallBitrate > 8_000_000) {
    warnings.push("Overall bitrate is high for many web pages and may benefit from compression.");
  }

  return {
    webFriendly: warnings.length === 0,
    warnings
  };
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-z0-9._-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/-+(\.[^.]+)$/g, "$1")
    .replace(/^-|-$/g, "");
}

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

export function defaultSettings(settings: Partial<OptimizationSettings>): OptimizationSettings {
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

export function vttToSrt(vtt: string): string {
  const normalized = vtt.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !/^WEBVTT\b/i.test(block) && !/^NOTE\b/i.test(block));
  const cues: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex === -1) continue;
    const timing = lines[timeIndex]
      .replace(/\./g, ",")
      .replace(/\s+align:\S+|\s+position:\S+|\s+line:\S+|\s+size:\S+/g, "");
    const text = lines
      .slice(timeIndex + 1)
      .join("\n")
      .trim();
    if (!text) continue;
    cues.push(`${cues.length + 1}\n${timing}\n${text}`);
  }

  return `${cues.join("\n\n")}\n`;
}

export function assertLooksLikeVtt(vtt: string): void {
  if (!vtt.includes("-->")) {
    throw new Error("Caption text must contain at least one WebVTT cue with a timing arrow.");
  }
}

export function parseCaptionTimestamp(timestamp: string): number | undefined {
  const match = timestamp.trim().match(/^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{3})$/);
  if (!match) return undefined;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

export function formatCaptionTimestamp(totalSeconds: number, separator: "." | "," = "."): string {
  const totalMilliseconds = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return (
    [String(hours).padStart(2, "0"), String(minutes).padStart(2, "0"), String(seconds).padStart(2, "0")].join(":") +
    `${separator}${String(milliseconds).padStart(3, "0")}`
  );
}

export function shiftCaptionTimings(captionText: string, offsetSeconds: number): string {
  if (offsetSeconds <= 0) return captionText;
  return captionText.replace(
    /(\d{2,}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3})(\s+-->\s+)(\d{2,}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3})/g,
    (line, start, arrow, end) => {
      const startSeconds = parseCaptionTimestamp(start);
      const endSeconds = parseCaptionTimestamp(end);
      if (startSeconds === undefined || endSeconds === undefined) return line;
      const separator = start.includes(",") ? "," : ".";
      const endSeparator = end.includes(",") ? "," : separator;
      return `${formatCaptionTimestamp(startSeconds + offsetSeconds, separator)}${arrow}${formatCaptionTimestamp(endSeconds + offsetSeconds, endSeparator)}`;
    }
  );
}
