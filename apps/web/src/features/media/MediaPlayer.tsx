import React from "react";
import { Captions, Maximize2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { formatMediaTime, isTextEntryElement } from "./media-time";

export type MediaPlayerProps = {
  src: string;
  label: string;
  className?: string;
  onTimeUpdate?: (seconds: number) => void;
  captionsAvailable?: boolean;
  poster?: string;
  knownDurationSeconds?: number;
};

export const MediaPlayer = React.forwardRef<HTMLVideoElement, MediaPlayerProps>(function MediaPlayer(
  { src, label, className = "", onTimeUpdate, captionsAvailable = false, poster, knownDurationSeconds = 0 },
  forwardedRef
) {
  const localRef = React.useRef<HTMLVideoElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [volume, setVolume] = React.useState(1);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(knownDurationSeconds);
  const [bufferedEnd, setBufferedEnd] = React.useState(0);
  const [playbackRate, setPlaybackRate] = React.useState(1);

  React.useImperativeHandle(forwardedRef, () => localRef.current as HTMLVideoElement);

  function updateBuffered(video: HTMLVideoElement) {
    if (video.buffered.length === 0 || !Number.isFinite(video.duration)) {
      setBufferedEnd(0);
      return;
    }
    setBufferedEnd(video.buffered.end(video.buffered.length - 1));
  }

  async function togglePlay() {
    const video = localRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  function seek(seconds: number) {
    const video = localRef.current;
    if (!video) return;
    const nextTime = Math.max(0, Math.min(seconds, video.duration || seconds));
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    onTimeUpdate?.(nextTime);
  }

  function toggleMute() {
    const video = localRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  async function requestFullscreen() {
    const target = containerRef.current;
    if (!target || !target.requestFullscreen) return;
    await target.requestFullscreen().catch(() => undefined);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isTextEntryElement(event.target)) return;
    if (event.key === " " || event.key.toLowerCase() === "k") {
      event.preventDefault();
      void togglePlay();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      seek(currentTime - 5);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      seek(currentTime + 5);
    }
    if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      toggleMute();
    }
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      void requestFullscreen();
    }
  }

  const playedPercent = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPercent = duration ? Math.min(100, (bufferedEnd / duration) * 100) : 0;

  return (
    <div
      className={`media-player ${className}`}
      ref={containerRef}
      tabIndex={0}
      role="group"
      aria-label={`${label} media player`}
      onKeyDown={handleKeyDown}
    >
      <video
        ref={localRef}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(video.duration || 0);
          setMuted(video.muted);
          setVolume(video.volume);
          updateBuffered(video);
        }}
        onProgress={(event) => updateBuffered(event.currentTarget)}
        onTimeUpdate={(event) => {
          const nextTime = event.currentTarget.currentTime;
          setCurrentTime(nextTime);
          onTimeUpdate?.(nextTime);
          updateBuffered(event.currentTarget);
        }}
        onVolumeChange={(event) => {
          setMuted(event.currentTarget.muted);
          setVolume(event.currentTarget.volume);
        }}
        onRateChange={(event) => setPlaybackRate(event.currentTarget.playbackRate)}
      />
      <div className="media-controls">
        <button
          className="media-icon-button"
          type="button"
          onClick={() => void togglePlay()}
          aria-label={playing ? "Pause video" : "Play video"}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <span className="media-time" aria-label={`Current time ${formatMediaTime(currentTime)}`}>
          {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
        </span>
        <label className="media-timeline-label">
          <span className="sr-only">Seek video timeline</span>
          <input
            className="media-timeline"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || currentTime)}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Seek video timeline"
            aria-valuetext={`${formatMediaTime(currentTime)} of ${formatMediaTime(duration)}`}
            style={
              {
                "--played": `${playedPercent}%`,
                "--buffered": `${bufferedPercent}%`
              } as React.CSSProperties
            }
          />
        </label>
        <button
          className="media-icon-button"
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute video" : "Mute video"}
        >
          {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <label className="media-volume-label">
          <span className="sr-only">Volume</span>
          <input
            className="media-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => {
              const video = localRef.current;
              if (!video) return;
              const nextVolume = Number(event.target.value);
              video.volume = nextVolume;
              video.muted = nextVolume === 0;
            }}
            aria-label="Volume"
            aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`}
          />
        </label>
        <label className="media-rate-label">
          <span className="sr-only">Playback speed</span>
          <select
            value={playbackRate}
            onChange={(event) => {
              const video = localRef.current;
              if (!video) return;
              video.playbackRate = Number(event.target.value);
            }}
            aria-label="Playback speed"
          >
            {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
              <option value={rate} key={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </label>
        {captionsAvailable && (
          <button className="media-icon-button" type="button" aria-label="Captions available">
            <Captions size={17} />
          </button>
        )}
        <button className="media-icon-button" type="button" onClick={() => seek(0)} aria-label="Restart video">
          <RotateCcw size={16} />
        </button>
        <button
          className="media-icon-button"
          type="button"
          onClick={() => void requestFullscreen()}
          aria-label="Enter fullscreen"
        >
          <Maximize2 size={17} />
        </button>
      </div>
    </div>
  );
});
