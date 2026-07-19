import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaPlayer } from "./MediaPlayer";

describe("MediaPlayer", () => {
  it("renders accessible custom controls and toggles play/pause", async () => {
    render(<MediaPlayer src="/video.mp4" label="Source preview" />);
    const player = screen.getByRole("group", { name: /source preview media player/i });
    const video = player.querySelector("video") as HTMLVideoElement;
    const play = vi.spyOn(video, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(video, "pause").mockImplementation(() => undefined);

    fireEvent.click(screen.getByRole("button", { name: /play video/i }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
    expect(screen.getByRole("slider", { name: /seek video timeline/i })).toBeVisible();
    expect(screen.getByRole("slider", { name: /volume/i })).toBeVisible();
    expect(screen.getByRole("combobox", { name: /playback speed/i })).toBeVisible();
    expect(screen.getByText("Seek video timeline")).toHaveClass("sr-only");
    expect(screen.getByText("Volume")).toHaveClass("sr-only");
    expect(screen.getByText("Playback speed")).toHaveClass("sr-only");
  });

  it("supports keyboard shortcuts but suppresses them while typing", () => {
    render(
      <div>
        <MediaPlayer src="/video.mp4" label="Keyboard video" />
        <input aria-label="Filename" />
      </div>
    );
    const player = screen.getByRole("group", { name: /keyboard video media player/i });
    const video = player.querySelector("video") as HTMLVideoElement;
    const play = vi.spyOn(video, "play").mockResolvedValue(undefined);

    fireEvent.keyDown(player, { key: "k" });
    expect(play).toHaveBeenCalledTimes(1);

    const input = screen.getByLabelText("Filename");
    fireEvent.keyDown(input, { key: "k" });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("updates mute, volume, speed, and seek controls", () => {
    render(<MediaPlayer src="/video.mp4" label="Control video" />);
    const player = screen.getByRole("group", { name: /control video media player/i });
    const video = player.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 42 });
    fireEvent.loadedMetadata(video);

    fireEvent.change(screen.getByRole("slider", { name: /seek video timeline/i }), { target: { value: "12.5" } });
    fireEvent.change(screen.getByRole("slider", { name: /volume/i }), { target: { value: "0" } });
    fireEvent.change(screen.getByRole("combobox", { name: /playback speed/i }), { target: { value: "1.5" } });

    expect(video.currentTime).toBe(12.5);
    expect(video.muted).toBe(true);
    expect(video.playbackRate).toBe(1.5);
  });

  it("uses known duration before media metadata is ready", () => {
    render(<MediaPlayer src="/video.mp4" label="Known duration video" knownDurationSeconds={42} />);

    expect(screen.getByText("0:00 / 0:42")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /seek video timeline/i })).toHaveAttribute("max", "42");
  });
});
