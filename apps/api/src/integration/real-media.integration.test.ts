import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { HistorySnapshot, JobDto, VideoRecordDto } from "@local-video-optimizer/contracts";
import { startCompiledApi, type CompiledApiHarness } from "./helpers/compiled-api-harness.js";
import { ensureMediaTools, generateAudioFixture, generateAvFixture, probeJson } from "./helpers/generated-media.js";
import { jsonRequest, waitForJobStatus, waitForTerminalJob } from "./helpers/polling.js";
import { zipEntryNames } from "./helpers/zip.js";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const roots: string[] = [];
let toolVersions: { ffmpegVersion: string; ffprobeVersion: string };

async function tempRoot(label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `web-video-${label}-`));
  roots.push(root);
  return root;
}

async function postVideo(
  harness: CompiledApiHarness,
  filePath: string,
  fileName: string,
  type = "video/mp4"
): Promise<Response> {
  const form = new FormData();
  form.append("video", new Blob([await readFile(filePath)], { type }), fileName);
  return fetch(`${harness.baseUrl}/api/videos`, { method: "POST", body: form });
}

async function uploadVideo(
  harness: CompiledApiHarness,
  filePath: string,
  fileName: string,
  type = "video/mp4"
): Promise<VideoRecordDto> {
  const response = await postVideo(harness, filePath, fileName, type);
  if (!response.ok) throw new Error(`upload failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as VideoRecordDto;
}

async function expectUploadFailure(
  harness: CompiledApiHarness,
  filePath: string,
  fileName: string,
  expectedStatus: number,
  expectedCode: string,
  type = "video/mp4"
): Promise<void> {
  const response = await postVideo(harness, filePath, fileName, type);
  expect(response.status).toBe(expectedStatus);
  expect(await response.json()).toMatchObject({ code: expectedCode });
}

async function directoryEntries(directory: string): Promise<string[]> {
  return readdir(directory).catch(() => []);
}

async function downloadBuffer(url: string, init?: RequestInit): Promise<{ response: Response; buffer: Buffer }> {
  const response = await fetch(url, init);
  return { response, buffer: Buffer.from(await response.arrayBuffer()) };
}

async function withApi(
  label: string,
  env: Record<string, string>,
  run: (harness: CompiledApiHarness, root: string) => Promise<void>
): Promise<void> {
  const root = await tempRoot(label);
  const storageRoot = path.join(root, "data");
  await mkdir(storageRoot, { recursive: true });
  const harness = await startCompiledApi({ repoRoot, storageRoot, env });
  try {
    await run(harness, root);
  } finally {
    await harness.stop();
  }
}

async function waitForPersistedJobs(storageRoot: string, jobIds: string[]): Promise<void> {
  const manifestPath = path.join(storageRoot, "manifest.json");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        jobs?: Array<{ id?: string }>;
      };
      const persistedIds = new Set(manifest.jobs?.map((job) => job.id).filter(Boolean));
      if (jobIds.every((jobId) => persistedIds.has(jobId))) return;
    } catch {
      // keep polling until the manifest exists and contains the expected jobs
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for jobs to persist: ${jobIds.join(", ")}`);
}

function slowWebmJob(outputFilename: string): Record<string, unknown> {
  return {
    outputContainer: "webm",
    videoCodec: "libaom-av1",
    audioCodec: "libopus",
    outputFilename,
    width: 1280,
    frameRate: 24,
    crf: 30,
    cpuUsed: 0
  };
}

beforeAll(async () => {
  toolVersions = await ensureMediaTools();
  console.info(toolVersions.ffmpegVersion);
  console.info(toolVersions.ffprobeVersion);
});

afterAll(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  );
});

describe("real media compiled API integration", () => {
  it("runs the basic upload, duplicate, MP4, range, poster, package, privacy, and cleanup workflow", async () => {
    await withApi("basic", {}, async (harness, root) => {
      const sourcePath = path.join(root, "source.mp4");
      await generateAvFixture(sourcePath, 2);

      await expect(fetch(`${harness.baseUrl}/health`)).resolves.toMatchObject({ status: 200 });
      await expect(fetch(`${harness.baseUrl}/api/capabilities`)).resolves.toMatchObject({ status: 200 });

      const video = await uploadVideo(harness, sourcePath, "source.mp4");
      expect(video.metadata.videoCodec).toBeTruthy();
      const storageBefore = await jsonRequest<{ managedBytes: number; areas: { uploads: { fileCount: number } } }>(
        `${harness.baseUrl}/api/storage`
      );
      expect(storageBefore.managedBytes).toBeGreaterThanOrEqual(0);
      expect(storageBefore.areas.uploads.fileCount).toBeGreaterThanOrEqual(1);
      const duplicate = await uploadVideo(harness, sourcePath, "copy.mp4");
      expect(duplicate.id).toBe(video.id);

      const renamed = await jsonRequest<VideoRecordDto>(`${harness.baseUrl}/api/videos/${video.id}`, {
        method: "PATCH",
        body: JSON.stringify({ originalName: "renamed-source.mp4" })
      });
      expect(renamed.originalName).toBe("renamed-source.mp4");

      const job = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/jobs`, {
        method: "POST",
        body: JSON.stringify({
          outputContainer: "mp4",
          videoCodec: "libx264",
          audioCodec: "aac",
          width: 160,
          frameRate: 24,
          crf: 28,
          preset: "veryfast",
          outputFilename: "integration-h264"
        })
      });
      const completed = await waitForTerminalJob(harness, job.id);
      expect(completed.status).toBe("completed");
      const output = await downloadBuffer(`${harness.baseUrl}/api/jobs/${job.id}/download`);
      expect(output.response.status).toBe(200);
      expect(output.buffer.length).toBeGreaterThan(0);
      const outputPath = path.join(root, "download.mp4");
      await writeFile(outputPath, output.buffer);
      const probed = await probeJson(outputPath);
      expect(JSON.stringify(probed)).toContain("h264");

      const ranged = await fetch(`${harness.baseUrl}/api/jobs/${job.id}/output`, { headers: { range: "bytes=-128" } });
      expect(ranged.status).toBe(206);
      expect(ranged.headers.get("content-range")).toMatch(/^bytes /);

      const poster = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/poster`, {
        method: "POST",
        body: JSON.stringify({ atSeconds: 0.5 })
      });
      const posterDone = await waitForTerminalJob(harness, poster.id);
      expect(posterDone.status).toBe("completed");
      const posterOutput = await downloadBuffer(`${harness.baseUrl}/api/jobs/${poster.id}/download`);
      expect(posterOutput.buffer.subarray(0, 4).toString("hex")).toBe("52494646");

      const packageJob = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/package`, {
        method: "POST",
        body: JSON.stringify({ jobIds: [job.id, poster.id], metadata: { filenamePrefix: "integration" } })
      });
      expect(packageJob.status).toBe("completed");
      const zip = await downloadBuffer(`${harness.baseUrl}/api/jobs/${packageJob.id}/download`);
      expect(zip.buffer.readUInt32LE(0)).toBe(0x04034b50);
      expect(zipEntryNames(zip.buffer)).toContain("embed.html");

      const history = await jsonRequest<HistorySnapshot>(`${harness.baseUrl}/api/history`);
      expect(JSON.stringify(history)).not.toMatch(/storedPath|outputPath|sidecarPath|sourceHash/);
      const cleanup = await jsonRequest<{ removedBytes: number; removedFileCount: number; storage: unknown }>(
        `${harness.baseUrl}/api/storage/cleanup`,
        { method: "POST", body: JSON.stringify({}) }
      );
      expect(cleanup.removedBytes).toBeGreaterThanOrEqual(0);
      expect(cleanup.removedFileCount).toBeGreaterThanOrEqual(0);

      await expect(fetch(`${harness.baseUrl}/api/jobs/${job.id}`, { method: "DELETE" })).resolves.toMatchObject({
        status: 204
      });
      await expect(fetch(`${harness.baseUrl}/api/videos/${video.id}`, { method: "DELETE" })).resolves.toMatchObject({
        status: 204
      });
    });
  });

  it("admits valid octet-stream media and rejects fake, audio-only, corrupt, and oversized uploads", async () => {
    await withApi("admission", { UPLOAD_FILE_SIZE_LIMIT_BYTES: "1048576" }, async (harness, root) => {
      const storageRoot = path.join(root, "data");
      const stagingDir = path.join(storageRoot, "tmp", "upload-staging");
      const uploadsDir = path.join(storageRoot, "uploads");
      const sourcePath = path.join(root, "source.mp4");
      const fakePath = path.join(root, "fake.mp4");
      const htmlPath = path.join(root, "fake-html.mp4");
      const audioPath = path.join(root, "audio-only.m4a");
      const corruptPath = path.join(root, "corrupt.mp4");
      await generateAvFixture(sourcePath, 1);
      await writeFile(fakePath, "not a video");
      await writeFile(htmlPath, "<!doctype html><script>alert(1)</script>");
      await generateAudioFixture(audioPath, 1);
      await writeFile(corruptPath, Buffer.from("00000018667479706d703432", "hex"));

      const video = await uploadVideo(harness, sourcePath, "source.bin", "application/octet-stream");
      expect(video.metadata.videoCodec).toBeTruthy();
      expect(await directoryEntries(stagingDir)).toEqual([]);
      const uploadCount = (await directoryEntries(uploadsDir)).length;

      const duplicate = await uploadVideo(harness, sourcePath, "duplicate.mp4", "application/octet-stream");
      expect(duplicate.id).toBe(video.id);
      expect(await directoryEntries(stagingDir)).toEqual([]);
      expect(await directoryEntries(uploadsDir)).toHaveLength(uploadCount);

      await expectUploadFailure(harness, fakePath, "fake.mp4", 415, "UNSUPPORTED_MEDIA_TYPE", "video/mp4");
      await expectUploadFailure(harness, htmlPath, "fake-html.mp4", 415, "UNSUPPORTED_MEDIA_TYPE", "video/mp4");
      await expectUploadFailure(harness, audioPath, "audio-only.mp4", 422, "INVALID_MEDIA", "video/mp4");
      await expectUploadFailure(harness, corruptPath, "corrupt.mp4", 422, "INVALID_MEDIA", "application/octet-stream");
      expect(await directoryEntries(stagingDir)).toEqual([]);
      expect(await directoryEntries(uploadsDir)).toHaveLength(uploadCount);
    });

    await withApi("oversize", { UPLOAD_FILE_SIZE_LIMIT_BYTES: "10" }, async (harness, root) => {
      const sourcePath = path.join(root, "source.mp4");
      const storageRoot = path.join(root, "data");
      await generateAvFixture(sourcePath, 1);

      await expectUploadFailure(harness, sourcePath, "source.mp4", 413, "UPLOAD_TOO_LARGE");
      expect(await directoryEntries(path.join(storageRoot, "tmp", "upload-staging"))).toEqual([]);
      expect(await directoryEntries(path.join(storageRoot, "uploads"))).toEqual([]);
    });

    await withApi(
      "capacity-reject",
      { MIN_FREE_STORAGE_BYTES: String(Number.MAX_SAFE_INTEGER) },
      async (harness, root) => {
        const sourcePath = path.join(root, "source.mp4");
        const storageRoot = path.join(root, "data");
        await generateAvFixture(sourcePath, 1);

        await expectUploadFailure(harness, sourcePath, "source.mp4", 507, "INSUFFICIENT_STORAGE");
        expect(await directoryEntries(path.join(storageRoot, "tmp", "upload-staging"))).toEqual([]);
        expect(await directoryEntries(path.join(storageRoot, "uploads"))).toEqual([]);
      }
    );
  });

  it("creates a WebM VP9 output and supports suffix byte ranges", async () => {
    await withApi("webm", {}, async (harness, root) => {
      const sourcePath = path.join(root, "source.mp4");
      await generateAvFixture(sourcePath, 2);
      const video = await uploadVideo(harness, sourcePath, "source.mp4");
      const job = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/jobs`, {
        method: "POST",
        body: JSON.stringify({
          outputContainer: "webm",
          videoCodec: "libvpx-vp9",
          audioCodec: "libopus",
          width: 160,
          frameRate: 24,
          crf: 36,
          outputFilename: "integration-vp9"
        })
      });
      const completed = await waitForTerminalJob(harness, job.id);
      expect(completed.status).toBe("completed");
      const output = await downloadBuffer(`${harness.baseUrl}/api/jobs/${job.id}/download`);
      const outputPath = path.join(root, "download.webm");
      await writeFile(outputPath, output.buffer);
      expect(JSON.stringify(await probeJson(outputPath))).toContain("vp9");
      await expect(
        fetch(`${harness.baseUrl}/api/jobs/${job.id}/output`, { headers: { range: "bytes=-128" } })
      ).resolves.toMatchObject({
        status: 206
      });
    });
  });

  it("fails timed-out media work, removes partial output, and accepts later work", async () => {
    await withApi(
      "timeout",
      { MEDIA_PROCESS_TIMEOUT_MS: "500", PROCESS_KILL_GRACE_PERIOD_MS: "10" },
      async (harness, root) => {
        const sourcePath = path.join(root, "source.mp4");
        await generateAvFixture(sourcePath, 6);
        const video = await uploadVideo(harness, sourcePath, "source.mp4");
        const job = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/jobs`, {
          method: "POST",
          body: JSON.stringify({
            outputContainer: "webm",
            videoCodec: "libaom-av1",
            audioCodec: "libopus",
            width: 1280,
            frameRate: 24,
            crf: 30,
            cpuUsed: 0,
            outputFilename: "timeout"
          })
        });
        await waitForJobStatus(harness, job.id, "running");
        const failed = await waitForTerminalJob(harness, job.id);
        expect(failed).toMatchObject({ status: "failed", message: "Media processing timed out after 500 ms" });
        await expect(fetch(`${harness.baseUrl}/api/jobs/${job.id}/download`)).resolves.toMatchObject({ status: 404 });
        const history = await jsonRequest<HistorySnapshot>(`${harness.baseUrl}/api/history`);
        expect(history.jobs.find((item) => item.id === job.id)?.status).toBe("failed");

        const later = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/jobs`, {
          method: "POST",
          body: JSON.stringify({
            outputContainer: "mp4",
            videoCodec: "libx264",
            width: 160,
            frameRate: 24,
            preset: "veryfast",
            outputFilename: "after-timeout"
          })
        });
        const laterDone = await waitForTerminalJob(harness, later.id);
        expect(laterDone.status).toBe("completed");
      }
    );
  });

  it("normalizes graceful shutdown and crash recovery states", async () => {
    const root = await tempRoot("recovery");
    const storageRoot = path.join(root, "data");
    const sourcePath = path.join(root, "source.mp4");
    await generateAvFixture(sourcePath, 8);
    let harness = await startCompiledApi({
      repoRoot,
      storageRoot,
      env: {
        MAX_CONCURRENT_MEDIA_JOBS: "1",
        MEDIA_PROCESS_TIMEOUT_MS: "60000",
        SHUTDOWN_GRACE_PERIOD_MS: "500"
      }
    });
    const video = await uploadVideo(harness, sourcePath, "source.mp4");
    const first = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/jobs`, {
      method: "POST",
      body: JSON.stringify(slowWebmJob("shutdown-1"))
    });
    const second = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/jobs`, {
      method: "POST",
      body: JSON.stringify(slowWebmJob("shutdown-2"))
    });
    await waitForJobStatus(harness, first.id, "running");
    await waitForJobStatus(harness, second.id, "queued");
    await waitForPersistedJobs(storageRoot, [first.id, second.id]);
    await harness.stop("SIGTERM");
    JSON.parse(await readFile(path.join(storageRoot, "manifest.json"), "utf8"));

    harness = await startCompiledApi({ repoRoot, storageRoot, env: { MAX_CONCURRENT_MEDIA_JOBS: "1" } });
    let history = await jsonRequest<HistorySnapshot>(`${harness.baseUrl}/api/history`);
    const expectedShutdownMessage =
      process.platform === "win32" ? "Canceled by API restart" : "Canceled by API shutdown";
    expect(history.jobs.filter((job) => [first.id, second.id].includes(job.id)).map((job) => job.message)).toEqual([
      expectedShutdownMessage,
      expectedShutdownMessage
    ]);
    await harness.kill();

    harness = await startCompiledApi({
      repoRoot,
      storageRoot,
      env: { MAX_CONCURRENT_MEDIA_JOBS: "1", MEDIA_PROCESS_TIMEOUT_MS: "60000" }
    });
    const cancelRunning = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/jobs`, {
      method: "POST",
      body: JSON.stringify(slowWebmJob("cancel-running"))
    });
    const cancelQueued = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/jobs`, {
      method: "POST",
      body: JSON.stringify(slowWebmJob("cancel-queued"))
    });
    const startsAfterCancel = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/jobs`, {
      method: "POST",
      body: JSON.stringify(slowWebmJob("starts-after-cancel"))
    });
    await waitForJobStatus(harness, cancelRunning.id, "running");
    await waitForJobStatus(harness, cancelQueued.id, "queued");
    const cancelQueuedResponse = await fetch(`${harness.baseUrl}/api/jobs/${cancelQueued.id}/cancel`, {
      method: "POST"
    });
    expect(cancelQueuedResponse.status).toBe(200);
    expect(((await cancelQueuedResponse.json()) as JobDto).status).toBe("canceled");
    await expect(fetch(`${harness.baseUrl}/api/jobs/${cancelQueued.id}/download`)).resolves.toMatchObject({
      status: 404
    });
    const cancelRunningResponse = await fetch(`${harness.baseUrl}/api/jobs/${cancelRunning.id}/cancel`, {
      method: "POST"
    });
    expect(cancelRunningResponse.status).toBe(200);
    expect(((await cancelRunningResponse.json()) as JobDto).status).toBe("canceled");
    await waitForJobStatus(harness, startsAfterCancel.id, "running");
    const cancelStartedResponse = await fetch(`${harness.baseUrl}/api/jobs/${startsAfterCancel.id}/cancel`, {
      method: "POST"
    });
    expect(cancelStartedResponse.status).toBe(200);
    expect(((await cancelStartedResponse.json()) as JobDto).status).toBe("canceled");

    await harness.stop();
    harness = await startCompiledApi({
      repoRoot,
      storageRoot,
      env: { MAX_CONCURRENT_MEDIA_JOBS: "1", MEDIA_PROCESS_TIMEOUT_MS: "60000" }
    });

    const crashFirst = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/jobs`, {
      method: "POST",
      body: JSON.stringify(slowWebmJob("crash-1"))
    });
    const crashSecond = await jsonRequest<JobDto>(`${harness.baseUrl}/api/videos/${video.id}/jobs`, {
      method: "POST",
      body: JSON.stringify(slowWebmJob("crash-2"))
    });
    await waitForJobStatus(harness, crashFirst.id, "running");
    await waitForJobStatus(harness, crashSecond.id, "queued");
    await waitForPersistedJobs(storageRoot, [crashFirst.id, crashSecond.id]);
    await harness.kill();

    harness = await startCompiledApi({ repoRoot, storageRoot, env: { MAX_CONCURRENT_MEDIA_JOBS: "1" } });
    try {
      history = await jsonRequest<HistorySnapshot>(`${harness.baseUrl}/api/history`);
      expect(
        history.jobs.filter((job) => [crashFirst.id, crashSecond.id].includes(job.id)).map((job) => job.message)
      ).toEqual(["Canceled by API restart", "Canceled by API restart"]);
      expect(await stat(path.join(storageRoot, "uploads", `${video.id}.mp4`))).toBeTruthy();
    } finally {
      await harness.stop();
    }
  });
});
