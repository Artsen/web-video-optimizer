import type { ReactNode } from "react";
import { Cpu, FileVideo, Package, ShieldCheck, Sparkles } from "lucide-react";
import type { OptimizationSettings } from "@local-video-optimizer/contracts";

export type Settings = OptimizationSettings & {
  audioBitrateKbps: number;
  cpuUsed: number;
  outputFilename: string;
  rowMt: boolean;
};

export type PresetInfo = {
  label: string;
  description: string;
  icon: ReactNode;
};

export const presets: Record<string, Partial<Settings>> = {
  "Maximum Compatibility": {
    outputContainer: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    crf: 23,
    preset: "medium",
    audioMode: "compress",
    audioBitrateKbps: 128,
    fastStart: true,
    stripMetadata: true
  },
  "Silent Background": {
    outputContainer: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    width: 1280,
    crf: 28,
    preset: "fast",
    frameRate: 24,
    audioMode: "remove",
    fastStart: true,
    stripMetadata: true
  },
  "Product / Marketing": {
    outputContainer: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    width: 1280,
    frameRate: 24,
    crf: 22,
    preset: "slow",
    audioMode: "compress",
    audioBitrateKbps: 160,
    audioSampleRate: 48000,
    audioChannels: 2,
    fastStart: true,
    stripMetadata: true
  },
  "AV1 Hero MP4": {
    outputContainer: "mp4",
    videoCodec: "libaom-av1",
    audioCodec: "aac",
    width: 1280,
    crf: 34,
    cpuUsed: 5,
    rowMt: true,
    frameRate: 24,
    audioMode: "remove",
    fastStart: true,
    stripMetadata: true
  },
  "AV1 WebM Small": {
    outputContainer: "webm",
    videoCodec: "libaom-av1",
    audioCodec: "libopus",
    width: 1280,
    crf: 34,
    cpuUsed: 5,
    rowMt: true,
    frameRate: 24,
    audioMode: "compress",
    audioBitrateKbps: 96,
    fastStart: false,
    stripMetadata: true
  }
};

export const presetInfo: Record<string, PresetInfo> = {
  "Maximum Compatibility": {
    label: "Best fallback",
    description: "MP4, H.264, AAC, and fast-start for the broadest browser support.",
    icon: <ShieldCheck size={20} />
  },
  "Silent Background": {
    label: "Looping hero",
    description: "Smaller, muted video for backgrounds and above-the-fold hero sections.",
    icon: <Sparkles size={20} />
  },
  "Product / Marketing": {
    label: "Balanced export",
    description: "A polished H.264 marketing-video fallback with stereo AAC audio.",
    icon: <FileVideo size={20} />
  },
  "AV1 Hero MP4": {
    label: "Modern silent",
    description: "AV1 compression for compact silent hero video experiments.",
    icon: <Cpu size={20} />
  },
  "AV1 WebM Small": {
    label: "Small modern file",
    description: "AV1/WebM with Opus audio for modern browser delivery.",
    icon: <Package size={20} />
  }
};

export const initialSettings: Settings = {
  outputContainer: "mp4",
  videoCodec: "libx264",
  audioCodec: "aac",
  crf: 24,
  preset: "medium",
  cpuUsed: 5,
  rowMt: true,
  audioMode: "compress",
  audioBitrateKbps: 128,
  audioSampleRate: 48000,
  audioChannels: 2,
  fastStart: true,
  stripMetadata: true,
  outputFilename: "optimized-video"
};
