import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  applyCompareAudioSource,
  syncCompareVideos,
  useSynchronizedPlayback,
  type CompareVideoLike
} from "./use-synchronized-playback";

function fakeVideo(overrides: Partial<CompareVideoLike> = {}): CompareVideoLike {
  return {
    currentTime: 0,
    duration: 42,
    paused: true,
    playbackRate: 1,
    muted: false,
    loop: false,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    ...overrides
  };
}

function Harness() {
  const playback = useSynchronizedPlayback();
  return (
    <div>
      <label>
        Sync
        <input
          type="checkbox"
          checked={playback.syncPlayback}
          onChange={(event) => playback.setSyncPlayback(event.target.checked)}
        />
      </label>
      <video ref={playback.registerCompareVideo("source")} data-testid="source" />
      <video ref={playback.registerCompareVideo("mp4")} data-testid="mp4" />
      <video ref={playback.registerCompareVideo("webm")} data-testid="webm" />
      <button type="button" onClick={() => playback.syncVideoState("source", "play")}>
        play source
      </button>
      <button type="button" onClick={() => playback.selectAudioSource("webm")}>
        webm audio
      </button>
      <button type="button" onClick={() => playback.seekAll(23.4)}>
        seek all
      </button>
    </div>
  );
}

describe("compare synchronization", () => {
  it("syncs play, seek, rate, and loop across multiple panes", () => {
    const source = fakeVideo({ currentTime: 12, playbackRate: 1.25, loop: true });
    const mp4 = fakeVideo({ currentTime: 0 });
    const webm = fakeVideo({ currentTime: 11.95 });
    const videos = new Map([
      ["source", source],
      ["mp4", mp4],
      ["webm", webm]
    ]);

    syncCompareVideos({ sourceId: "source", videos, action: "play", syncEnabled: true });

    expect(mp4.currentTime).toBe(12);
    expect(webm.currentTime).toBe(11.95);
    expect(mp4.playbackRate).toBe(1.25);
    expect(webm.loop).toBe(true);
    expect(mp4.play).toHaveBeenCalledTimes(1);
    expect(webm.play).toHaveBeenCalledTimes(1);
  });

  it("pauses every non-source pane and respects disabled sync", () => {
    const source = fakeVideo({ currentTime: 8 });
    const mp4 = fakeVideo({ currentTime: 0 });
    const videos = new Map([
      ["source", source],
      ["mp4", mp4]
    ]);

    syncCompareVideos({ sourceId: "source", videos, action: "pause", syncEnabled: false });
    expect(mp4.pause).not.toHaveBeenCalled();

    syncCompareVideos({ sourceId: "source", videos, action: "pause", syncEnabled: true });
    expect(mp4.pause).toHaveBeenCalledTimes(1);
  });

  it("keeps only the selected audio source unmuted", () => {
    const source = fakeVideo();
    const mp4 = fakeVideo();
    const webm = fakeVideo();
    const videos = new Map([
      ["source", source],
      ["mp4", mp4],
      ["webm", webm]
    ]);

    applyCompareAudioSource(videos, "mp4");
    expect(source.muted).toBe(true);
    expect(mp4.muted).toBe(false);
    expect(webm.muted).toBe(true);

    applyCompareAudioSource(videos, "muted");
    expect([...videos.values()].every((video) => video.muted)).toBe(true);
  });

  it("hook registers three panes, seeks them together, and changes audio without playback drift", () => {
    vi.useFakeTimers();
    render(<Harness />);
    const source = screen.getByTestId("source") as HTMLVideoElement;
    const mp4 = screen.getByTestId("mp4") as HTMLVideoElement;
    const webm = screen.getByTestId("webm") as HTMLVideoElement;
    vi.spyOn(mp4, "play").mockResolvedValue(undefined);
    vi.spyOn(webm, "play").mockResolvedValue(undefined);

    source.currentTime = 10;
    fireEvent.click(screen.getByRole("button", { name: /play source/i }));
    act(() => vi.advanceTimersByTime(90));
    fireEvent.click(screen.getByRole("button", { name: /seek all/i }));
    fireEvent.click(screen.getByRole("button", { name: /webm audio/i }));

    expect(mp4.currentTime).toBe(23.4);
    expect(webm.currentTime).toBe(23.4);
    expect(source.muted).toBe(true);
    expect(mp4.muted).toBe(true);
    expect(webm.muted).toBe(false);
    vi.useRealTimers();
  });
});
