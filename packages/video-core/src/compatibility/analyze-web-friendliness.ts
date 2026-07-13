import type { VideoMetadata } from "@local-video-optimizer/contracts";

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
