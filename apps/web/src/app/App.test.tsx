import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { AppDependencies } from "./app-dependencies";
import type { VideoOptimizerApi } from "../api/api-client";
import type { JobEvents } from "../api/job-events";
import { capabilities, historySnapshot, job, videoRecord } from "../testing/fixtures";

function createApi(overrides: Partial<VideoOptimizerApi> = {}): VideoOptimizerApi {
  return {
    getCapabilities: vi.fn().mockResolvedValue(capabilities({ whisperCpp: true, whisperModel: true })),
    getHistory: vi.fn().mockResolvedValue(historySnapshot()),
    uploadVideo: vi.fn().mockResolvedValue(videoRecord()),
    importVideoUrl: vi.fn().mockResolvedValue(videoRecord({ id: "video-url" })),
    renameVideo: vi.fn().mockResolvedValue(videoRecord({ originalName: "renamed.mp4" })),
    deleteVideo: vi.fn().mockResolvedValue(undefined),
    createOptimizationJob: vi.fn().mockResolvedValue(job({ id: "custom-job", status: "queued", progress: 0 })),
    createSampleJob: vi
      .fn()
      .mockResolvedValue(job({ id: "sample-job", kind: "sample", status: "queued", progress: 0 })),
    createPosterJob: vi
      .fn()
      .mockResolvedValue(job({ id: "poster-job", kind: "poster", status: "queued", progress: 0 })),
    createPairJobs: vi.fn().mockResolvedValue({
      jobs: [
        job({ id: "fallback-job", status: "queued", progress: 0 }),
        job({
          id: "modern-job",
          status: "queued",
          progress: 0,
          settings: { ...job().settings, outputContainer: "webm", videoCodec: "libaom-av1", audioCodec: "libopus" }
        })
      ]
    }),
    createSubtitleJob: vi.fn().mockResolvedValue(job({ id: "subtitle-job", kind: "subtitle", status: "queued" })),
    getCaptions: vi.fn().mockResolvedValue({ vtt: "WEBVTT\n\nHello" }),
    updateCaptions: vi.fn().mockResolvedValue(job({ id: "subtitle-job", kind: "subtitle" })),
    createMuxJob: vi.fn().mockResolvedValue(job({ id: "mux-job", kind: "mux", status: "queued" })),
    createPackageJob: vi.fn().mockResolvedValue(job({ id: "package-job", kind: "package", status: "queued" })),
    renameJob: vi.fn().mockResolvedValue(job({ outputFileName: "renamed-output.mp4" })),
    cancelJob: vi.fn().mockResolvedValue(job({ status: "canceled" })),
    deleteJob: vi.fn().mockResolvedValue(undefined),
    deleteHistory: vi.fn().mockResolvedValue(historySnapshot()),
    revealJob: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function createJobEvents() {
  const handlers = new Map<string, Parameters<JobEvents["subscribe"]>[1]>();
  const closeCalls: string[] = [];
  const jobEvents: JobEvents = {
    subscribe: vi.fn((jobId, nextHandlers) => {
      handlers.set(jobId, nextHandlers);
      return {
        close() {
          closeCalls.push(jobId);
          handlers.delete(jobId);
        }
      };
    })
  };
  return { closeCalls, jobEvents, handlers };
}

function renderApp(api = createApi()) {
  const { closeCalls, jobEvents, handlers } = createJobEvents();
  const dependencies: AppDependencies = {
    api,
    apiBaseUrl: "http://localhost:4000",
    jobEvents
  };
  const view = render(<App dependencies={dependencies} />);
  return { api, closeCalls, jobEvents, handlers, ...view };
}

describe("App behavior", () => {
  it("loads capabilities and history and shows the empty source state", async () => {
    const api = createApi();
    renderApp(api);

    expect(await screen.findByText("Waiting For A Source")).toBeInTheDocument();
    expect(api.getCapabilities).toHaveBeenCalledTimes(1);
    expect(api.getHistory).toHaveBeenCalledTimes(1);
  });

  it("uploads a selected file, activates the source, and displays metadata", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const { container } = render(
      <App dependencies={{ api, apiBaseUrl: "http://localhost:4000", jobEvents: createJobEvents().jobEvents }} />
    );
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeInstanceOf(HTMLInputElement);

    await user.upload(input as HTMLInputElement, new File(["video"], "local.mp4", { type: "video/mp4" }));

    await screen.findByDisplayValue("homepage-video.mp4");
    expect(api.uploadVideo).toHaveBeenCalledWith(expect.objectContaining({ name: "local.mp4" }));
    expect(screen.getByText("Source Details")).toBeInTheDocument();
    expect(screen.getAllByText("9.5 MB").length).toBeGreaterThan(0);
  });

  it("sends current settings to Optimize For Website and subscribes to returned jobs", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const { handlers, jobEvents } = renderApp(api);

    await waitFor(() => expect(api.getHistory).toHaveBeenCalled());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["video"], "local.mp4", { type: "video/mp4" }));
    await screen.findByDisplayValue("homepage-video.mp4");
    await user.click(screen.getByRole("button", { name: /optimize for website/i }));

    expect(api.createPairJobs).toHaveBeenCalledWith("video-1", expect.objectContaining({ outputContainer: "mp4" }));
    expect(vi.mocked(jobEvents.subscribe).mock.calls.map(([jobId]) => jobId)).toEqual(
      expect.arrayContaining(["fallback-job", "modern-job"])
    );

    handlers.get("fallback-job")?.onUpdate(job({ id: "fallback-job", status: "completed", progress: 100 }));

    await waitFor(() => expect(screen.getAllByText("MP4 fallback").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Jobs & Outputs").length).toBeGreaterThan(0);
  });

  it("closes active job subscriptions when the app unmounts", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const { closeCalls, unmount } = renderApp(api);

    await waitFor(() => expect(api.getHistory).toHaveBeenCalled());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["video"], "local.mp4", { type: "video/mp4" }));
    await screen.findByDisplayValue("homepage-video.mp4");
    await user.click(screen.getByRole("button", { name: /optimize for website/i }));

    unmount();

    expect(closeCalls).toEqual(expect.arrayContaining(["fallback-job", "modern-job"]));
  });

  it("closes active job subscriptions when resetting to a new blank video", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const { closeCalls } = renderApp(api);

    await waitFor(() => expect(api.getHistory).toHaveBeenCalled());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["video"], "local.mp4", { type: "video/mp4" }));
    await screen.findByDisplayValue("homepage-video.mp4");
    await user.click(screen.getByRole("button", { name: /optimize for website/i }));
    await user.click(screen.getByRole("button", { name: /new video/i }));

    expect(closeCalls).toEqual(expect.arrayContaining(["fallback-job", "modern-job"]));
    expect(screen.getByText("Waiting For A Source")).toBeInTheDocument();
  });

  it("shows safe API failure messages during upload", async () => {
    const user = userEvent.setup();
    const api = createApi({ uploadVideo: vi.fn().mockRejectedValue(new Error("Upload rejected safely")) });
    const { container } = render(
      <App dependencies={{ api, apiBaseUrl: "http://localhost:4000", jobEvents: createJobEvents().jobEvents }} />
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, new File(["video"], "bad.mp4", { type: "video/mp4" }));

    const alert = await screen.findByText("Upload rejected safely");
    expect(within(alert.closest(".error") as HTMLElement).getByText("Upload rejected safely")).toBeInTheDocument();
  });

  it("submits meaningful custom optimization settings", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const { container } = renderApp(api);

    await waitFor(() => expect(api.getHistory).toHaveBeenCalled());
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["video"], "local.mp4", { type: "video/mp4" })
    );
    await screen.findByDisplayValue("homepage-video.mp4");
    await user.click(screen.getByRole("button", { name: /^custom$/i }));

    fireEvent.change(container.querySelector('input[type="range"]') as HTMLInputElement, { target: { value: "40" } });
    await user.click(screen.getByRole("button", { name: /export current settings/i }));

    expect(api.createOptimizationJob).toHaveBeenCalledWith("video-1", expect.objectContaining({ crf: 40 }));
  });

  it("restores a history video and can delete it", async () => {
    const user = userEvent.setup();
    const restored = { ...videoRecord({ id: "history-video", originalName: "archive.mp4" }), jobIds: [] };
    const api = createApi({
      getHistory: vi.fn().mockResolvedValue(historySnapshot({ videos: [restored], jobs: [] })),
      deleteHistory: vi.fn().mockResolvedValue(historySnapshot())
    });
    renderApp(api);

    await user.click(await screen.findByRole("button", { name: /archive.mp4/i }));
    expect(screen.getByDisplayValue("archive.mp4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /manage library/i }));
    await user.click(screen.getByRole("button", { name: "Delete file" }));

    expect(api.deleteHistory).toHaveBeenCalledWith(["history-video"], []);
  });

  it("loads and saves caption edits", async () => {
    const user = userEvent.setup();
    const restored = { ...videoRecord({ id: "video-1" }), jobIds: ["subtitle-1"] };
    const subtitle = job({
      id: "subtitle-1",
      kind: "subtitle",
      status: "completed",
      outputFileName: "captions.vtt",
      sidecarFileName: "captions.srt"
    });
    const api = createApi({
      getHistory: vi.fn().mockResolvedValue(historySnapshot({ videos: [restored], jobs: [subtitle] }))
    });
    renderApp(api);

    await user.click(await screen.findByRole("button", { name: /homepage-video.mp4/i }));
    await user.click(screen.getAllByRole("button", { name: /jobs & outputs/i })[0]);
    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const editor = await screen.findByLabelText(/webvtt captions/i);
    await user.clear(editor);
    await user.type(editor, "WEBVTT\n\nEdited line");
    await user.click(screen.getByRole("button", { name: /save captions/i }));

    expect(api.getCaptions).toHaveBeenCalledWith("subtitle-1");
    expect(api.updateCaptions).toHaveBeenCalledWith("subtitle-1", "WEBVTT\n\nEdited line");
  });
});
