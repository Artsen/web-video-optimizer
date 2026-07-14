import React from "react";

type CompareSide = "original" | "optimized";
type SyncAction = "play" | "pause" | "seek" | "rate";

export function useSynchronizedPlayback() {
  const [syncPlayback, setSyncPlayback] = React.useState(true);
  const [compareMediaErrors, setCompareMediaErrors] = React.useState<{ original?: string; optimized?: string }>({});
  const originalCompareRef = React.useRef<HTMLVideoElement | null>(null);
  const optimizedCompareRef = React.useRef<HTMLVideoElement | null>(null);
  const isSyncingRef = React.useRef(false);

  function otherCompareVideo(source: CompareSide): HTMLVideoElement | null {
    return source === "original" ? optimizedCompareRef.current : originalCompareRef.current;
  }

  function syncVideoState(source: CompareSide, action: SyncAction) {
    if (!syncPlayback || isSyncingRef.current) return;

    const sourceVideo = source === "original" ? originalCompareRef.current : optimizedCompareRef.current;
    const targetVideo = otherCompareVideo(source);
    if (!sourceVideo || !targetVideo) return;

    isSyncingRef.current = true;
    targetVideo.playbackRate = sourceVideo.playbackRate;

    if (Math.abs(targetVideo.currentTime - sourceVideo.currentTime) > 0.2) {
      targetVideo.currentTime = sourceVideo.currentTime;
    }

    if (action === "play") {
      void targetVideo.play().catch(() => undefined);
    }

    if (action === "pause") {
      targetVideo.pause();
    }

    window.setTimeout(() => {
      isSyncingRef.current = false;
    }, 120);
  }

  return {
    syncPlayback,
    setSyncPlayback,
    compareMediaErrors,
    setCompareMediaErrors,
    originalCompareRef,
    optimizedCompareRef,
    syncVideoState
  };
}
