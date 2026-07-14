import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSynchronizedPlayback } from "./use-synchronized-playback";

function Harness() {
  const playback = useSynchronizedPlayback();
  const { originalCompareRef, optimizedCompareRef, setSyncPlayback, syncPlayback, syncVideoState } = playback;
  return (
    <div>
      <label>
        Sync
        <input type="checkbox" checked={syncPlayback} onChange={(event) => setSyncPlayback(event.target.checked)} />
      </label>
      <video ref={originalCompareRef} data-testid="original" />
      <video ref={optimizedCompareRef} data-testid="optimized" />
      <button type="button" onClick={() => syncVideoState("original", "play")}>
        play original
      </button>
      <button type="button" onClick={() => syncVideoState("optimized", "pause")}>
        pause optimized
      </button>
      <button type="button" onClick={() => syncVideoState("original", "seek")}>
        seek original
      </button>
    </div>
  );
}

describe("useSynchronizedPlayback", () => {
  it("propagates play, pause, and seek between media elements", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    const original = screen.getByTestId("original") as HTMLVideoElement;
    const optimized = screen.getByTestId("optimized") as HTMLVideoElement;
    const play = vi.spyOn(optimized, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(original, "pause").mockImplementation(() => undefined);

    original.currentTime = 12;
    fireEvent.click(screen.getByRole("button", { name: /play original/i }));
    act(() => vi.advanceTimersByTime(150));
    optimized.currentTime = 7;
    fireEvent.click(screen.getByRole("button", { name: /pause optimized/i }));
    act(() => vi.advanceTimersByTime(150));
    original.currentTime = 22;
    fireEvent.click(screen.getByRole("button", { name: /seek original/i }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(optimized.currentTime).toBe(22);
    vi.useRealTimers();
  });

  it("does not propagate while synchronization is disabled", async () => {
    render(<Harness />);
    const optimized = screen.getByTestId("optimized") as HTMLVideoElement;
    const play = vi.spyOn(optimized, "play").mockResolvedValue(undefined);

    fireEvent.click(screen.getByRole("checkbox", { name: /sync/i }));
    fireEvent.click(screen.getByRole("button", { name: /play original/i }));

    expect(play).not.toHaveBeenCalled();
  });
});
