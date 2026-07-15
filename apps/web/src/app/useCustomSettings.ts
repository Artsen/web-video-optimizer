import React from "react";
import type { VideoRecordDto } from "@local-video-optimizer/contracts";
import {
  normalizeOutputContainerChange,
  normalizeVideoCodecChange,
  estimateOutputSize,
  buildRecommendations
} from "../video-ui";
import { initialSettings, presetInfo, presets, type Settings } from "./app-config";

export function useCustomSettings(video: VideoRecordDto | null) {
  const [settings, setSettings] = React.useState<Settings>(initialSettings);
  const [activePreset, setActivePreset] = React.useState("Maximum Compatibility");
  const estimate = video ? estimateOutputSize(video.metadata, settings) : undefined;
  const recommendations = video ? buildRecommendations(video.metadata, settings, estimate) : [];

  function applyPreset(name: string) {
    setActivePreset(name);
    setSettings((current) => ({ ...current, ...presets[name] }));
  }

  function updateOutputContainer(outputContainer: Settings["outputContainer"]) {
    setSettings((current) => {
      const next = normalizeOutputContainerChange(current, outputContainer);
      return { ...next, outputFilename: next.outputFilename ?? current.outputFilename };
    });
  }

  function updateVideoCodec(videoCodec: Settings["videoCodec"]) {
    setSettings((current) => {
      const next = normalizeVideoCodecChange(current, videoCodec);
      return { ...next, outputFilename: next.outputFilename ?? current.outputFilename };
    });
  }

  function applyTargetSize(targetMb: number) {
    if (!video?.metadata.durationSeconds) return;
    const targetBitsPerSecond = (targetMb * 1024 * 1024 * 8) / video.metadata.durationSeconds;
    const hasAudio = video.metadata.trackCounts.audio > 0;
    const targetVideoBits = targetBitsPerSecond - (hasAudio ? 96_000 : 0);
    const aggressive = targetMb <= 2 || targetVideoBits < 800_000;
    const balanced = targetMb <= 5 || targetVideoBits < 1_600_000;

    setSettings((current) => ({
      ...current,
      width: aggressive ? 854 : balanced ? 1280 : Math.min(video.metadata.width ?? 1920, 1920),
      frameRate: aggressive || (video.metadata.frameRate ?? 0) > 30 ? 24 : current.frameRate,
      crf:
        current.videoCodec === "libx264"
          ? aggressive
            ? 30
            : balanced
              ? 27
              : 24
          : aggressive
            ? 38
            : balanced
              ? 34
              : 30,
      audioMode: hasAudio ? "compress" : "remove",
      audioBitrateKbps: aggressive ? 64 : balanced ? 96 : 128
    }));
  }

  function resetSettings() {
    setSettings(initialSettings);
  }

  return {
    activePreset,
    applyPreset,
    applyTargetSize,
    estimate,
    recommendations,
    resetSettings,
    presetInfo,
    presets,
    setSettings,
    settings,
    updateOutputContainer,
    updateVideoCodec
  };
}
