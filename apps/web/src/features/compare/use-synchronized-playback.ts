import React from "react";

export type ComparePlaybackAction = "play" | "pause" | "seek" | "rate" | "loop";
export type CompareAudioSource = string | "muted";

const DRIFT_THRESHOLD_SECONDS = 0.16;

export type CompareVideoLike = {
  currentTime: number;
  duration?: number;
  paused: boolean;
  playbackRate: number;
  muted: boolean;
  loop: boolean;
  play: () => Promise<void>;
  pause: () => void;
};

export function syncCompareVideos({
  sourceId,
  videos,
  action,
  syncEnabled,
  driftThresholdSeconds = DRIFT_THRESHOLD_SECONDS
}: {
  sourceId: string;
  videos: Map<string, CompareVideoLike>;
  action: ComparePlaybackAction;
  syncEnabled: boolean;
  driftThresholdSeconds?: number;
}): void {
  if (!syncEnabled) return;
  const source = videos.get(sourceId);
  if (!source) return;

  for (const [id, target] of videos) {
    if (id === sourceId) continue;
    target.playbackRate = source.playbackRate;
    target.loop = source.loop;
    if (Math.abs(target.currentTime - source.currentTime) > driftThresholdSeconds) {
      target.currentTime = source.currentTime;
    }
    if (action === "play") void target.play().catch(() => undefined);
    if (action === "pause") target.pause();
  }
}

export function applyCompareAudioSource(videos: Map<string, CompareVideoLike>, audioSource: CompareAudioSource): void {
  for (const [id, video] of videos) {
    video.muted = audioSource === "muted" || id !== audioSource;
  }
}

export function useSynchronizedPlayback() {
  const [syncPlayback, setSyncPlayback] = React.useState(true);
  const [compareMediaErrors, setCompareMediaErrors] = React.useState<Record<string, string | undefined>>({});
  const [audioSource, setAudioSource] = React.useState<CompareAudioSource>("source");
  const [loop, setLoop] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [playbackRate, setPlaybackRate] = React.useState(1);
  const videosRef = React.useRef(new Map<string, HTMLVideoElement>());
  const isSyncingRef = React.useRef(false);
  const animationRef = React.useRef<number | null>(null);

  const registerCompareVideo = React.useCallback(
    (id: string) => (node: HTMLVideoElement | null) => {
      if (node) {
        videosRef.current.set(id, node);
        node.muted = audioSource === "muted" || id !== audioSource;
        node.loop = loop;
        node.playbackRate = playbackRate;
        if (currentTime > 0 && Math.abs(node.currentTime - currentTime) > DRIFT_THRESHOLD_SECONDS) {
          node.currentTime = currentTime;
        }
      } else {
        videosRef.current.delete(id);
      }
    },
    [audioSource, currentTime, loop, playbackRate]
  );

  const syncVideoState = React.useCallback(
    (sourceId: string, action: ComparePlaybackAction) => {
      if (isSyncingRef.current) return;
      const source = videosRef.current.get(sourceId);
      if (!source) return;
      isSyncingRef.current = true;
      setCurrentTime(source.currentTime);
      setDuration(source.duration || duration);
      setPlaybackRate(source.playbackRate);
      setLoop(source.loop);
      setPlaying(!source.paused);
      syncCompareVideos({
        sourceId,
        videos: videosRef.current as unknown as Map<string, CompareVideoLike>,
        action,
        syncEnabled: syncPlayback
      });
      window.setTimeout(() => {
        isSyncingRef.current = false;
      }, 80);
    },
    [duration, syncPlayback]
  );

  const seekAll = React.useCallback((seconds: number) => {
    const nextTime = Math.max(0, seconds);
    videosRef.current.forEach((video) => {
      const boundedTime = video.duration ? Math.min(nextTime, video.duration) : nextTime;
      if (Math.abs(video.currentTime - boundedTime) > 0.02) video.currentTime = boundedTime;
    });
    setCurrentTime(nextTime);
  }, []);

  const playAll = React.useCallback(async () => {
    videosRef.current.forEach((video) => {
      video.playbackRate = playbackRate;
      video.loop = loop;
      if (Math.abs(video.currentTime - currentTime) > DRIFT_THRESHOLD_SECONDS) video.currentTime = currentTime;
    });
    await Promise.all(Array.from(videosRef.current.values()).map((video) => video.play().catch(() => undefined)));
    setPlaying(true);
  }, [currentTime, loop, playbackRate]);

  const pauseAll = React.useCallback(() => {
    videosRef.current.forEach((video) => video.pause());
    setPlaying(false);
  }, []);

  const setAllPlaybackRate = React.useCallback((nextRate: number) => {
    videosRef.current.forEach((video) => {
      video.playbackRate = nextRate;
    });
    setPlaybackRate(nextRate);
  }, []);

  const setAllLoop = React.useCallback((nextLoop: boolean) => {
    videosRef.current.forEach((video) => {
      video.loop = nextLoop;
    });
    setLoop(nextLoop);
  }, []);

  const selectAudioSource = React.useCallback((nextSource: CompareAudioSource) => {
    setAudioSource(nextSource);
    applyCompareAudioSource(videosRef.current as unknown as Map<string, CompareVideoLike>, nextSource);
  }, []);

  React.useEffect(() => {
    applyCompareAudioSource(videosRef.current as unknown as Map<string, CompareVideoLike>, audioSource);
  }, [audioSource]);

  React.useEffect(() => {
    if (!playing || !syncPlayback) return undefined;
    const tick = () => {
      const master =
        videosRef.current.get(audioSource === "muted" ? "source" : audioSource) ??
        videosRef.current.values().next().value;
      if (master) {
        setCurrentTime(master.currentTime);
        setDuration(master.duration || 0);
        videosRef.current.forEach((video) => {
          if (video === master) return;
          video.playbackRate = master.playbackRate;
          if (Math.abs(video.currentTime - master.currentTime) > DRIFT_THRESHOLD_SECONDS) {
            video.currentTime = master.currentTime;
          }
        });
      }
      animationRef.current = window.requestAnimationFrame(tick);
    };
    animationRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
    };
  }, [audioSource, playing, syncPlayback]);

  return {
    syncPlayback,
    setSyncPlayback,
    compareMediaErrors,
    setCompareMediaErrors,
    audioSource,
    selectAudioSource,
    currentTime,
    duration,
    playing,
    playbackRate,
    loop,
    registerCompareVideo,
    syncVideoState,
    seekAll,
    playAll,
    pauseAll,
    setAllPlaybackRate,
    setAllLoop
  };
}
