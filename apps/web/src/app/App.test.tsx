import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { AppDependencies } from "./app-dependencies";
import type { VideoOptimizerApi } from "../api/api-client";
import type { JobEvents } from "../api/job-events";
import { capabilities, historySnapshot, job, storageStatus, videoRecord } from "../testing/fixtures";

function createApi(overrides: Partial<VideoOptimizerApi> = {}): VideoOptimizerApi {
  return {
    getCapabilities: vi.fn().mockResolvedValue(capabilities({ whisperCpp: true, whisperModel: true })),
    getStorageStatus: vi.fn().mockResolvedValue(storageStatus()),
    cleanupStorage: vi.fn().mockResolvedValue({ removedBytes: 250_000, removedFileCount: 1, storage: storageStatus() }),
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

async function findNamedButtonWithClass(name: RegExp, className: string): Promise<HTMLButtonElement> {
  let match: HTMLButtonElement | undefined;
  await waitFor(() => {
    match = screen
      .getAllByRole("button", { name })
      .find((button): button is HTMLButtonElement => button.classList.contains(className));
    expect(match).toBeDefined();
  });
  return match as HTMLButtonElement;
}

describe("App behavior", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("loads capabilities and history and shows the empty source state", async () => {
    const api = createApi();
    renderApp(api);

    expect(await screen.findByRole("heading", { name: "Ready for a source video" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Web Video Optimizer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready for a source video" })).toBeInTheDocument();
    expect(screen.getByText(/fast, compatible website video package/i)).toBeInTheDocument();
    expect(screen.getByText(/local processing/i)).toBeInTheDocument();
    expect(api.getCapabilities).toHaveBeenCalledTimes(1);
    expect(api.getHistory).toHaveBeenCalledTimes(1);
    expect(api.getStorageStatus).toHaveBeenCalledTimes(1);
  });

  it("shows an accessible startup panel when the API is unreachable", async () => {
    const api = createApi({
      getHistory: vi.fn().mockRejectedValue(new TypeError("Failed to fetch C:\\secret\\manifest.json")),
      getCapabilities: vi.fn().mockRejectedValue(new TypeError("Failed to fetch D:\\tools\\ffmpeg.exe")),
      getStorageStatus: vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    });
    renderApp(api);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Cannot reach the local API" })).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Retry connection" })).toBeInTheDocument();
    expect(within(alert).getByText("http://localhost:4000")).toBeInTheDocument();
    expect(alert).not.toHaveTextContent("C:\\secret");
    expect(alert).not.toHaveTextContent("D:\\tools");
    expect(screen.queryByRole("heading", { name: "Ready for a source video" })).not.toBeInTheDocument();
  });

  it("keeps usable startup with a partial bootstrap warning and clears it after retry", async () => {
    const user = userEvent.setup();
    const api = createApi({
      getStorageStatus: vi.fn().mockRejectedValueOnce(new Error("D:\\private\\data")).mockResolvedValue(storageStatus())
    });
    renderApp(api);

    expect(await screen.findByRole("heading", { name: "Ready for a source video" })).toBeInTheDocument();
    const warning = await screen.findByRole("status");
    expect(warning).toHaveTextContent("Storage status");
    expect(warning).not.toHaveTextContent("D:\\private");

    await user.click(within(warning).getByRole("button", { name: "Retry connection" }));

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(api.getHistory).toHaveBeenCalledTimes(2);
    expect(api.getCapabilities).toHaveBeenCalledTimes(2);
    expect(api.getStorageStatus).toHaveBeenCalledTimes(2);
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

    await findNamedButtonWithClass(/homepage-video.mp4/i, "source-title-button");
    expect(api.uploadVideo).toHaveBeenCalledWith(expect.objectContaining({ name: "local.mp4" }));
    expect(screen.getByText("Source Details")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Prepare" })).toBeInTheDocument();
    expect(screen.getByText("Optimize for website")).toBeInTheDocument();
    expect(screen.getByText(/87-94% smaller/)).toBeInTheDocument();
    expect(screen.getAllByText("9.5 MB").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^results$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /jump to results/i })).not.toBeInTheDocument();
    expect(window.location.search).toContain("view=prepare");
  });

  it("sends current settings to Optimize For Website and subscribes to returned jobs", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const { handlers, jobEvents } = renderApp(api);

    await waitFor(() => expect(api.getHistory).toHaveBeenCalled());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["video"], "local.mp4", { type: "video/mp4" }));
    await findNamedButtonWithClass(/homepage-video.mp4/i, "source-title-button");
    await user.click(screen.getByRole("button", { name: /optimize for website/i }));
    expect(window.location.search).toContain("view=prepare");

    expect(api.createPairJobs).toHaveBeenCalledWith("video-1", expect.objectContaining({ outputContainer: "mp4" }));
    expect(vi.mocked(jobEvents.subscribe).mock.calls.map(([jobId]) => jobId)).toEqual(
      expect.arrayContaining(["fallback-job", "modern-job"])
    );

    handlers.get("fallback-job")?.onUpdate(job({ id: "fallback-job", status: "completed", progress: 100 }));

    await waitFor(() => expect(window.location.search).toContain("view=results"));
    await waitFor(() => expect(screen.getAllByText("MP4 fallback").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Results").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^view results$/i })).not.toBeInTheDocument();
  });

  it("closes active job subscriptions when the app unmounts", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const { closeCalls, unmount } = renderApp(api);

    await waitFor(() => expect(api.getHistory).toHaveBeenCalled());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["video"], "local.mp4", { type: "video/mp4" }));
    await findNamedButtonWithClass(/homepage-video.mp4/i, "source-title-button");
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
    await findNamedButtonWithClass(/homepage-video.mp4/i, "source-title-button");
    await user.click(screen.getByRole("button", { name: /optimize for website/i }));
    await user.click(screen.getByRole("button", { name: /new video/i }));

    expect(closeCalls).toEqual(expect.arrayContaining(["fallback-job", "modern-job"]));
    expect(screen.getByRole("heading", { name: "Ready for a source video" })).toBeInTheDocument();
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
    await findNamedButtonWithClass(/homepage-video.mp4/i, "source-title-button");
    await user.click(screen.getByRole("button", { name: /custom export/i }));
    await user.click(screen.getByText("Advanced settings"));

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

    await user.click(await findNamedButtonWithClass(/archive.mp4/i, "sidebar-file"));
    expect(await findNamedButtonWithClass(/archive.mp4/i, "source-title-button")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /^library$/i })[0]);
    await user.click(screen.getByRole("button", { name: "Source row actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete source" }));

    expect(api.deleteHistory).toHaveBeenCalledWith(["history-video"], []);
  });

  it("surfaces history deletion failures", async () => {
    const user = userEvent.setup();
    const restored = { ...videoRecord({ id: "history-video", originalName: "archive.mp4" }), jobIds: [] };
    const api = createApi({
      getHistory: vi.fn().mockResolvedValue(historySnapshot({ videos: [restored], jobs: [] })),
      deleteHistory: vi.fn().mockRejectedValue(new Error("Could not delete selected local files."))
    });
    renderApp(api);

    await user.click(await screen.findByRole("button", { name: /archive.mp4/i }));
    await user.click(screen.getAllByRole("button", { name: /^library$/i })[0]);
    await user.click(screen.getByRole("button", { name: "Source row actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete source" }));

    await waitFor(() => expect(api.deleteHistory).toHaveBeenCalledWith(["history-video"], []));
    expect(await screen.findByText("Could not delete selected local files.")).toBeInTheDocument();
  });

  it("shows storage pressure, usage details, and temporary cleanup feedback", async () => {
    const user = userEvent.setup();
    const api = createApi({
      getStorageStatus: vi.fn().mockResolvedValue(
        storageStatus({
          pressure: "warning",
          reservedBytes: 500_000,
          availableBytes: undefined,
          configuredMaxBytes: 20_000_000,
          cleanup: { staleTemporaryBytes: 1_500_000, staleTemporaryFileCount: 2 }
        })
      ),
      cleanupStorage: vi.fn().mockResolvedValue({
        removedBytes: 1_500_000,
        removedFileCount: 2,
        storage: storageStatus({ cleanup: { staleTemporaryBytes: 0, staleTemporaryFileCount: 0 } })
      })
    });
    renderApp(api);

    await user.click((await screen.findAllByRole("button", { name: /^library$/i }))[0]);

    expect(screen.getByText("Storage is low")).toBeInTheDocument();
    await user.click(screen.getByText("Review storage"));
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("488.3 KB")).toBeInTheDocument();
    expect(screen.getByText("19.1 MB")).toBeInTheDocument();
    expect(screen.getByText(/Reclaimable temporary data: 1.4 MB across 2 file/)).toBeInTheDocument();
    expect(screen.queryByText(/D:\\/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clean temporary files only/i }));

    expect(api.cleanupStorage).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Reclaimed 2 temporary file(s).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clean temporary files only/i })).toBeDisabled();
  });

  it("surfaces storage cleanup errors readably", async () => {
    const user = userEvent.setup();
    const api = createApi({
      getStorageStatus: vi
        .fn()
        .mockResolvedValue(
          storageStatus({ pressure: "critical", cleanup: { staleTemporaryBytes: 750_000, staleTemporaryFileCount: 1 } })
        ),
      cleanupStorage: vi.fn().mockRejectedValue(new Error("Not enough free storage space to clean temporary files."))
    });
    renderApp(api);

    await user.click((await screen.findAllByRole("button", { name: /^library$/i }))[0]);
    expect(screen.getByText(/Storage is critically low/)).toBeInTheDocument();
    await user.click(screen.getByText("Review storage"));
    await user.click(screen.getByRole("button", { name: /clean temporary files only/i }));
    expect(await screen.findByText("Not enough free storage space to clean temporary files.")).toBeInTheDocument();
  });

  it("restores history sources with outputs directly to inline results", async () => {
    const user = userEvent.setup();
    const restored = { ...videoRecord({ id: "video-1" }), jobIds: ["job-1"] };
    const api = createApi({
      getHistory: vi.fn().mockResolvedValue(historySnapshot({ videos: [restored], jobs: [job({ id: "job-1" })] }))
    });
    renderApp(api);

    await user.click(await screen.findByRole("button", { name: /homepage-video.mp4/i }));

    expect(await screen.findByRole("heading", { name: "Results" })).toBeInTheDocument();
    expect(window.location.search).toContain("view=results");
    expect(window.location.search).toContain("source=video-1");
  });

  it("restores history sources without completed outputs to prepare", async () => {
    const user = userEvent.setup();
    const restored = { ...videoRecord({ id: "video-1" }), jobIds: ["failed-job"] };
    const api = createApi({
      getHistory: vi.fn().mockResolvedValue(
        historySnapshot({
          videos: [restored],
          jobs: [job({ id: "failed-job", status: "failed", outputSize: 0 })]
        })
      )
    });
    renderApp(api);

    await user.click(await screen.findByRole("button", { name: /homepage-video.mp4/i }));

    expect(await screen.findByRole("heading", { name: "Prepare" })).toBeInTheDocument();
    expect(window.location.search).toContain("view=prepare");
  });

  it("lets an explicit prepare URL override the processed-source results default", async () => {
    window.history.replaceState(null, "", "/?view=prepare&source=video-1");
    const restored = { ...videoRecord({ id: "video-1" }), jobIds: ["job-1"] };
    const api = createApi({
      getHistory: vi.fn().mockResolvedValue(historySnapshot({ videos: [restored], jobs: [job({ id: "job-1" })] }))
    });
    renderApp(api);

    expect(await screen.findByRole("heading", { name: "Prepare" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Results" })).toBeInTheDocument();
    expect(window.location.search).toContain("view=prepare");
  });

  it("shows compact preparation controls in the results state", async () => {
    window.history.replaceState(null, "", "/?view=results&source=video-1&output=job-1");
    const restored = { ...videoRecord({ id: "video-1" }), jobIds: ["job-1"] };
    const api = createApi({
      getHistory: vi.fn().mockResolvedValue(historySnapshot({ videos: [restored], jobs: [job({ id: "job-1" })] }))
    });
    renderApp(api);

    expect(await screen.findByRole("heading", { name: "Results" })).toBeInTheDocument();
    expect(screen.getByText("Smallest output")).toBeInTheDocument();
    expect(screen.getByLabelText("Smallest output size comparison")).toBeInTheDocument();
    const disclosure = screen.getByText("Edit source / preparation options");
    expect(disclosure.closest("details")).not.toHaveAttribute("open");
    await userEvent.click(disclosure);
    expect(disclosure.closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Optimize for website" })).toBeInTheDocument();
  });

  it("recovers gracefully when a routed source is missing", async () => {
    window.history.replaceState(null, "", "/?view=results&source=missing-video&output=job-1");
    renderApp(createApi());

    expect(await screen.findByRole("heading", { name: "Source is no longer available" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add New Video" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Library" })).toBeInTheDocument();
    expect(window.location.search).toBe("?view=library");
  });

  it("restores selected output from the URL", async () => {
    window.history.replaceState(null, "", "/?view=results&source=video-1&output=modern-job");
    const restored = { ...videoRecord({ id: "video-1" }), jobIds: ["fallback-job", "modern-job"] };
    const api = createApi({
      getHistory: vi.fn().mockResolvedValue(
        historySnapshot({
          videos: [restored],
          jobs: [
            job({ id: "fallback-job", outputFileName: "homepage-video-fallback-h264.mp4" }),
            job({ id: "modern-job", outputFileName: "homepage-video-modern-av1.webm", outputSize: 700_000 })
          ]
        })
      )
    });
    renderApp(api);

    expect(await screen.findByRole("heading", { name: "Results" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Selected output" })).getByText("homepage-video-modern-av1.webm")
    ).toBeInTheDocument();
  });

  it("recovers invalid selected outputs to the first valid output", async () => {
    window.history.replaceState(null, "", "/?view=results&source=video-1&output=missing-job");
    const restored = { ...videoRecord({ id: "video-1" }), jobIds: ["fallback-job"] };
    const api = createApi({
      getHistory: vi.fn().mockResolvedValue(
        historySnapshot({
          videos: [restored],
          jobs: [job({ id: "fallback-job", outputFileName: "homepage-video-fallback-h264.mp4" })]
        })
      )
    });
    renderApp(api);

    expect(await screen.findByRole("heading", { name: "Results" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toContain("output=fallback-job"));
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
    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const editor = await screen.findByLabelText(/webvtt captions/i);
    await user.clear(editor);
    await user.type(editor, "WEBVTT\n\nEdited line");
    await user.click(screen.getByRole("button", { name: /save captions/i }));

    expect(api.getCaptions).toHaveBeenCalledWith("subtitle-1");
    expect(api.updateCaptions).toHaveBeenCalledWith("subtitle-1", "WEBVTT\n\nEdited line");
  });
});
