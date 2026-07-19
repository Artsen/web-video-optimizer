import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { videoRecord } from "../../testing/fixtures";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { UploadPanel } from "./UploadPanel";

function controller(overrides: Partial<VideoOptimizerAppController["source"]> = {}): VideoOptimizerAppController {
  return {
    source: {
      video: null,
      sourceUrl: "",
      sourceDownloadUrl: "",
      sourceNameDraft: "",
      setSourceNameDraft: vi.fn(),
      renamingSource: false,
      renameSource: vi.fn(),
      uploadFile: vi.fn(),
      videoUrl: "",
      setVideoUrl: vi.fn(),
      importVideoUrl: vi.fn(),
      sourcePreviewRef: { current: null },
      posterTimestamp: 0,
      setPosterTimestamp: vi.fn(),
      useCurrentPreviewFrame: vi.fn(),
      startPosterJob: vi.fn(),
      startSubtitleJob: vi.fn(),
      ...overrides
    },
    status: {
      isUploading: false,
      importStatus: "",
      error: null,
      currentStatus: "Ready",
      capabilities: { ytDlp: false }
    },
    jobs: { posterJob: null }
  } as unknown as VideoOptimizerAppController;
}

describe("UploadPanel", () => {
  it("shows the empty upload state and sends file selections to the controller", async () => {
    const user = userEvent.setup();
    const uploadFile = vi.fn();
    const next = controller({ uploadFile });
    const { container } = render(<UploadPanel controller={next} />);

    expect(screen.getByRole("heading", { name: "Add a source video" })).toBeInTheDocument();
    expect(screen.getByText(/local processing/i)).toBeInTheDocument();
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["video"], "clip.mp4", { type: "video/mp4" })
    );

    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ name: "clip.mp4" }));
  });

  it("renders active source controls and uses the current frame callback", async () => {
    const user = userEvent.setup();
    const useCurrentPreviewFrame = vi.fn();
    render(
      <UploadPanel
        controller={controller({
          video: videoRecord(),
          sourceUrl: "http://localhost/source",
          sourceDownloadUrl: "http://localhost/download",
          sourceNameDraft: "homepage-video.mp4",
          useCurrentPreviewFrame
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: /use current frame/i }));

    expect(screen.getByRole("button", { name: /homepage-video.mp4/i })).toBeInTheDocument();
    expect(useCurrentPreviewFrame).toHaveBeenCalledTimes(1);
  });
});
