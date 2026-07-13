import type { VideoMetadata } from "@local-video-optimizer/contracts";
import { analyzeWebFriendliness } from "../compatibility/analyze-web-friendliness.js";
import { parseNumber, parseRate } from "./parse-values.js";
import type { FFprobeResult, FFprobeStream } from "./types.js";

function findRotation(stream?: FFprobeStream): string | undefined {
  const rotateTag = stream?.tags?.rotate;
  if (rotateTag) return `${rotateTag}deg`;

  const sideData = stream?.side_data_list?.find((item) => "rotation" in item);
  const rotation = sideData?.rotation;
  return typeof rotation === "number" ? `${rotation}deg` : undefined;
}

export function normalizeProbe(fileName: string, probe: FFprobeResult): VideoMetadata {
  const streams = probe.streams ?? [];
  const videoStreams = streams.filter((stream) => stream.codec_type === "video");
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  const subtitleStreams = streams.filter((stream) => stream.codec_type === "subtitle");
  const primaryVideo = videoStreams[0];
  const primaryAudio = audioStreams[0];

  const base = {
    fileName,
    fileSize: parseNumber(probe.format?.size) ?? 0,
    durationSeconds: parseNumber(probe.format?.duration) ?? 0,
    container: probe.format?.format_name ?? "unknown",
    formatLongName: probe.format?.format_long_name,
    videoCodec: primaryVideo?.codec_name,
    audioCodec: primaryAudio?.codec_name,
    trackCounts: {
      video: videoStreams.length,
      audio: audioStreams.length,
      subtitle: subtitleStreams.length
    },
    width: primaryVideo?.width,
    height: primaryVideo?.height,
    displayAspectRatio: primaryVideo?.display_aspect_ratio,
    frameRate: parseRate(primaryVideo?.avg_frame_rate ?? primaryVideo?.r_frame_rate),
    overallBitrate: parseNumber(probe.format?.bit_rate),
    videoBitrate: parseNumber(primaryVideo?.bit_rate),
    audioBitrate: parseNumber(primaryAudio?.bit_rate),
    audioSampleRate: parseNumber(primaryAudio?.sample_rate),
    audioChannels: primaryAudio?.channels,
    pixelFormat: primaryVideo?.pix_fmt,
    color: {
      space: primaryVideo?.color_space,
      transfer: primaryVideo?.color_transfer,
      primaries: primaryVideo?.color_primaries
    },
    rotation: findRotation(primaryVideo),
    tags: probe.format?.tags
  };

  return {
    ...base,
    ...analyzeWebFriendliness(base)
  };
}
