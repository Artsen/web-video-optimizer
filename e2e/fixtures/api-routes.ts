import type { Page, Route } from "@playwright/test";

type JobStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export const mockVideo = {
  id: "video-1",
  originalName: "homepage-video.mp4",
  uploadedAt: "2026-07-14T00:00:00.000Z",
  jobIds: ["fallback-job", "modern-job", "poster-job", "subtitle-job"],
  metadata: {
    fileName: "homepage-video.mp4",
    fileSize: 10_000_000,
    durationSeconds: 42,
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    videoCodec: "h264",
    audioCodec: "aac",
    trackCounts: { video: 1, audio: 1, subtitle: 0 },
    width: 1920,
    height: 1080,
    frameRate: 30,
    overallBitrate: 6_000_000,
    audioBitrate: 128_000,
    pixelFormat: "yuv420p",
    webFriendly: true,
    warnings: []
  }
};

export const fallbackJob = createJob("fallback-job", "encode", "completed", {
  outputFileName: "homepage-video-fallback-h264.mp4",
  outputSize: 950_000
});
export const modernJob = createJob("modern-job", "encode", "completed", {
  outputFileName: "homepage-video-modern-av1.webm",
  outputSize: 640_000,
  settings: { outputContainer: "webm", videoCodec: "libaom-av1", audioCodec: "libopus" }
});
export const posterJob = createJob("poster-job", "poster", "completed", {
  outputFileName: "homepage-video-poster.webp",
  outputSize: 40_000
});
export const subtitleJob = createJob("subtitle-job", "subtitle", "completed", {
  outputFileName: "homepage-video-captions.vtt",
  sidecarFileName: "homepage-video-captions.srt",
  outputSize: 4_000
});

export async function installMockApi(page: Page, options: { withHistory?: boolean } = {}) {
  const requests: { method: string; url: string; postData: string | null }[] = [];
  let hasVideo = options.withHistory ?? false;
  let historyJobs = hasVideo ? [fallbackJob, modernJob, posterJob, subtitleJob] : [];

  await page.addInitScript(() => {
    type Handler = (event: MessageEvent) => void;
    const sources = new Map<string, { url: string; onmessage: Handler | null; onerror: (() => void) | null }>();
    class MockEventSource {
      url: string;
      onmessage: Handler | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string) {
        this.url = url;
        sources.set(url, this);
      }
      close() {
        sources.delete(this.url);
      }
    }
    window.EventSource = MockEventSource as typeof EventSource;
    Object.assign(window, {
      __emitJobEvent(urlPart: string, payload: unknown) {
        const source = Array.from(sources.values()).find((candidate) => candidate.url.includes(urlPart));
        source?.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
      },
      __eventSourceCount() {
        return sources.size;
      },
      __hasEventSource(urlPart: string) {
        return Array.from(sources.values()).some((candidate) => candidate.url.includes(urlPart));
      }
    });
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({ method: request.method(), url: url.pathname, postData: request.postData() });

    if (url.pathname === "/api/capabilities") {
      await json(route, { libx264: true, libaomAv1: true, libvpxVp9: true, aac: true, libopus: true, ytDlp: true });
      return;
    }
    if (url.pathname === "/api/history" && request.method() === "GET") {
      await json(route, hasVideo ? { videos: [mockVideo], jobs: historyJobs } : { videos: [], jobs: [] });
      return;
    }
    if (url.pathname === "/api/videos" && request.method() === "POST") {
      hasVideo = true;
      await json(route, mockVideo);
      return;
    }
    if (url.pathname === "/api/videos/url") {
      hasVideo = true;
      await json(route, mockVideo);
      return;
    }
    if (url.pathname === "/api/videos/video-1/pair") {
      hasVideo = true;
      historyJobs = [fallbackJob, modernJob, posterJob];
      await json(route, {
        jobs: [
          createJob("fallback-job", "encode", "running", { progress: 40 }),
          createJob("modern-job", "encode", "queued", {
            settings: { outputContainer: "webm", videoCodec: "libaom-av1", audioCodec: "libopus" }
          })
        ]
      });
      return;
    }
    if (url.pathname === "/api/videos/video-1/jobs") {
      hasVideo = true;
      await json(route, createJob("custom-job", "encode", "running", { progress: 10 }));
      return;
    }
    if (url.pathname === "/api/videos/video-1/poster") {
      hasVideo = true;
      historyJobs = [fallbackJob, modernJob, posterJob];
      await json(route, posterJob);
      return;
    }
    if (url.pathname === "/api/videos/video-1/package") {
      await json(
        route,
        createJob("package-job", "package", "completed", { outputFileName: "homepage-video-package.zip" })
      );
      return;
    }
    if (url.pathname === "/api/videos/video-1/subtitles") {
      historyJobs = [fallbackJob, modernJob, posterJob, subtitleJob];
      await json(route, subtitleJob);
      return;
    }
    if (url.pathname === "/api/jobs/subtitle-job/captions") {
      if (request.method() === "GET") await json(route, { vtt: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello.\n" });
      else await json(route, subtitleJob);
      return;
    }
    if (url.pathname.endsWith("/mux-subtitles")) {
      await json(route, createJob("mux-job", "mux", "running", { outputFileName: "homepage-video-captioned.mp4" }));
      return;
    }
    if (url.pathname.endsWith("/cancel")) {
      await json(route, createJob(url.pathname.split("/")[3], "encode", "canceled"));
      return;
    }
    if (url.pathname === "/api/history/delete") {
      await json(route, { videos: [], jobs: [] });
      return;
    }
    if (url.pathname.endsWith("/download") || url.pathname.endsWith("/output") || url.pathname.endsWith("/sidecar")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/octet-stream", "content-disposition": "attachment; filename=file.bin" },
        body: "mock"
      });
      return;
    }
    await route.fulfill({ status: 204, body: "" });
  });

  return { requests };
}

function createJob(
  id: string,
  kind: "encode" | "sample" | "poster" | "package" | "subtitle" | "mux",
  status: JobStatus,
  overrides: Record<string, unknown> = {}
) {
  const baseSettings = {
    outputContainer: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    crf: 26,
    preset: "slow",
    cpuUsed: 5,
    rowMt: true,
    audioMode: "compress",
    audioBitrateKbps: 128,
    audioSampleRate: 48000,
    audioChannels: 2,
    frameRate: 24,
    width: 1280,
    fastStart: true,
    stripMetadata: true,
    outputFilename: "homepage-video"
  };
  const settings =
    typeof overrides.settings === "object" && overrides.settings
      ? { ...baseSettings, ...(overrides.settings as Record<string, unknown>) }
      : baseSettings;
  return {
    id,
    videoId: "video-1",
    kind,
    status,
    progress: status === "completed" ? 100 : 0,
    outputFileName: "homepage-video.mp4",
    outputSize: status === "completed" ? 900_000 : undefined,
    ffmpegCommand: "ffmpeg -i input.mp4 output.mp4",
    startedAt: "2026-07-14T00:00:01.000Z",
    completedAt: status === "completed" ? "2026-07-14T00:00:02.000Z" : undefined,
    ...overrides,
    settings
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}
