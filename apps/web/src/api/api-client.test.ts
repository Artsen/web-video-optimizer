import { describe, expect, it, vi } from "vitest";
import { createVideoOptimizerApi } from "./api-client";
import { ApiClientError } from "./api-error";
import { capabilities, historySnapshot, job, packageMetadata, settings, videoRecord } from "../testing/fixtures";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

function createFetch(body: unknown = {}): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(jsonResponse(body)));
}

async function requestOf(fetchFn: ReturnType<typeof vi.fn<typeof fetch>>) {
  const [url, init] = fetchFn.mock.calls[0];
  const body = init?.body;
  return {
    url: String(url),
    init: init ?? {},
    body: typeof body === "string" ? JSON.parse(body) : undefined
  };
}

describe("api client", () => {
  it("loads capabilities and history with GET requests", async () => {
    const fetchFn = createFetch(capabilities());
    const api = createVideoOptimizerApi({ baseUrl: "http://localhost:4000", fetchFn });

    await expect(api.getCapabilities()).resolves.toMatchObject({ libx264: true, libaomAv1: true });
    expect((await requestOf(fetchFn)).url).toBe("http://localhost:4000/api/capabilities");

    fetchFn.mockResolvedValueOnce(jsonResponse(historySnapshot({ videos: [{ ...videoRecord(), jobIds: [] }] })));
    await expect(api.getHistory()).resolves.toMatchObject({ videos: [{ id: "video-1" }] });
    expect(fetchFn.mock.calls[1][0]).toBe("http://localhost:4000/api/history");
  });

  it("uploads multipart video without manually setting content type", async () => {
    const fetchFn = createFetch(videoRecord());
    const api = createVideoOptimizerApi({ baseUrl: "http://localhost:4000", fetchFn });

    await api.uploadVideo(new File(["video"], "source.mp4", { type: "video/mp4" }));

    const { url, init } = await requestOf(fetchFn);
    expect(url).toBe("http://localhost:4000/api/videos");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();
  });

  it("sends json request shapes for video, job, captions, package, and history operations", async () => {
    const fetchFn = createFetch(job());
    const api = createVideoOptimizerApi({ baseUrl: "http://localhost:4000/", fetchFn });

    await api.importVideoUrl("https://www.youtube.com/watch?v=abc");
    await api.renameVideo("video-1", "final.mp4");
    await api.createOptimizationJob("video-1", settings({ crf: 40 }));
    await api.createSampleJob("video-1", settings(), 5);
    await api.createPosterJob("video-1", 2.5);
    await api.createSubtitleJob("video-1");
    await api.getCaptions("subtitle-1");
    await api.updateCaptions("subtitle-1", "WEBVTT");
    await api.createMuxJob("job-1", "subtitle-1");
    await api.createPackageJob("video-1", ["job-1"], packageMetadata());
    await api.renameJob("job-1", "output.mp4");
    await api.cancelJob("job-1");
    await api.deleteHistory(["video-1"], ["job-1"]);
    await api.revealJob("job-1");

    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:4000/api/videos/url",
      "http://localhost:4000/api/videos/video-1",
      "http://localhost:4000/api/videos/video-1/jobs",
      "http://localhost:4000/api/videos/video-1/sample",
      "http://localhost:4000/api/videos/video-1/poster",
      "http://localhost:4000/api/videos/video-1/subtitles",
      "http://localhost:4000/api/jobs/subtitle-1/captions",
      "http://localhost:4000/api/jobs/subtitle-1/captions",
      "http://localhost:4000/api/jobs/job-1/mux-subtitles",
      "http://localhost:4000/api/videos/video-1/package",
      "http://localhost:4000/api/jobs/job-1",
      "http://localhost:4000/api/jobs/job-1/cancel",
      "http://localhost:4000/api/history/delete",
      "http://localhost:4000/api/jobs/job-1/reveal"
    ]);

    expect(fetchFn.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    expect(JSON.parse(String(fetchFn.mock.calls[2][1]?.body))).toMatchObject({ crf: 40 });
    expect(JSON.parse(String(fetchFn.mock.calls[3][1]?.body))).toMatchObject({ sampleSeconds: 5 });
    expect(JSON.parse(String(fetchFn.mock.calls[7][1]?.body))).toEqual({ vtt: "WEBVTT" });
    expect(JSON.parse(String(fetchFn.mock.calls[8][1]?.body))).toEqual({ subtitleJobId: "subtitle-1" });
    expect(JSON.parse(String(fetchFn.mock.calls[12][1]?.body))).toEqual({ videoIds: ["video-1"], jobIds: ["job-1"] });
  });

  it("preserves pair compatibility by POSTing the current settings body", async () => {
    const fetchFn = createFetch({ jobs: [job()] });
    const api = createVideoOptimizerApi({ baseUrl: "http://localhost:4000", fetchFn });

    await expect(api.createPairJobs("video-1", settings({ crf: 36 }))).resolves.toMatchObject({
      jobs: [{ id: "job-1" }]
    });

    const { url, init, body } = await requestOf(fetchFn);
    expect(url).toBe("http://localhost:4000/api/videos/video-1/pair");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(body).toMatchObject({ crf: 36, outputContainer: "mp4", videoCodec: "libx264" });
  });

  it("handles empty successful responses", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const api = createVideoOptimizerApi({ baseUrl: "http://localhost:4000", fetchFn });

    await expect(api.deleteJob("job-1")).resolves.toBeUndefined();
  });

  it("parses structured and plain-text error responses", async () => {
    const structuredFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(
          { error: "Bad request", code: "VALIDATION_ERROR", details: [{ path: "crf", message: "Too high" }] },
          { status: 400 }
        )
      );
    const api = createVideoOptimizerApi({ baseUrl: "http://localhost:4000", fetchFn: structuredFetch });

    await expect(api.createOptimizationJob("video-1", settings())).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Bad request",
      details: [{ path: "crf", message: "Too high" }]
    } satisfies Partial<ApiClientError>);

    const textFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response("Server exploded", { status: 500 }));
    const textApi = createVideoOptimizerApi({ baseUrl: "http://localhost:4000", fetchFn: textFetch });
    await expect(textApi.getHistory()).rejects.toMatchObject({ status: 500, message: "Server exploded" });
  });
});
