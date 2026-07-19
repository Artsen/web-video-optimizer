import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { job, videoRecord } from "../../testing/fixtures";
import { CompareView } from "./CompareView";

function createController(): VideoOptimizerAppController {
  const fallbackJob = job({
    id: "fallback-job",
    outputFileName: "homepage-video-fallback-h264.mp4",
    outputSize: 900_000
  });
  const modernJob = job({
    id: "modern-job",
    outputFileName: "homepage-video-modern-av1.webm",
    outputSize: 625_000
  });

  return {
    apiBaseUrl: "http://localhost:4000",
    source: {
      video: videoRecord(),
      sourceUrl: "http://localhost:4000/api/videos/video-1/source"
    },
    jobs: {
      job: fallbackJob,
      completedOutputJobs: [fallbackJob, modernJob]
    },
    compare: {
      downloadUrl: "",
      videoMarkup: "",
      completedReduction: 91,
      compareAllRequested: true,
      syncPlayback: true,
      setSyncPlayback: vi.fn(),
      compareMediaErrors: {},
      setCompareMediaErrors: vi.fn(),
      audioSource: "source",
      selectAudioSource: vi.fn(),
      compareCurrentTime: 0,
      compareDuration: 42,
      comparePlaying: false,
      comparePlaybackRate: 1,
      compareLoop: false,
      registerCompareVideo: vi.fn(() => vi.fn()),
      syncVideoState: vi.fn(),
      seekAll: vi.fn(),
      playAll: vi.fn(),
      pauseAll: vi.fn(),
      setAllPlaybackRate: vi.fn(),
      setAllLoop: vi.fn()
    }
  } as unknown as VideoOptimizerAppController;
}

describe("CompareView", () => {
  it("keeps A/B controls clickable and wipe dragging separate from zoom pan", async () => {
    const user = userEvent.setup();
    const { container } = render(<CompareView controller={createController()} />);

    await user.click(screen.getByRole("button", { name: "A/B" }));
    const originalSwitch = within(screen.getByLabelText("A/B visible version")).getByRole("button", {
      name: "Original"
    });
    await user.click(originalSwitch);

    expect(originalSwitch).toHaveClass("active");

    await user.click(screen.getByRole("button", { name: "Wipe" }));
    await user.click(screen.getByRole("button", { name: "Zoom comparison to 200%" }));

    const divider = screen.getByLabelText("Wipe divider position") as HTMLInputElement;
    fireEvent.pointerDown(divider, { button: 0, clientX: 120, clientY: 120 });
    fireEvent.change(divider, { target: { value: "62" } });
    fireEvent.pointerMove(divider, { button: 0, clientX: 260, clientY: 120 });
    fireEvent.pointerUp(divider);

    expect(divider.value).toBe("62");
    expect(container.querySelector(".compare-media-stage")).toHaveStyle({
      transform: "translate3d(0px, 0px, 0) scale(2)"
    });
  });
});
