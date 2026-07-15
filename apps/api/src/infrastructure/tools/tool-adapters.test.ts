import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiConfig } from "../../config.js";
import { FakeProcessRunner } from "../processes/test/fake-process-runner.js";
import { createCommandRunner } from "./command-runner.js";
import { ProcessFfmpegCapabilitiesAdapter } from "./ffmpeg-capabilities-adapter.js";
import { FfprobeAdapter } from "./ffprobe-adapter.js";
import { ConfigWhisperAdapter } from "./whisper-adapter.js";
import { stripWrappingQuotes, YtDlpAdapter } from "./yt-dlp-adapter.js";

const policy = {
  timeoutMs: 60_000,
  terminationGracePeriodMs: 5_000,
  maxCapturedOutputBytes: 4 * 1024 * 1024
};
const tempDirs: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "web-video-tools-"));
  tempDirs.push(dir);
  return dir;
}

async function waitForSpawn(runner: FakeProcessRunner): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    if (runner.calls.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function config(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    host: "127.0.0.1",
    port: 4000,
    allowLanAccess: false,
    corsOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
    jsonBodyLimitBytes: 5 * 1024 * 1024,
    storageRoot: "data",
    uploadDir: "data/uploads",
    outputDir: "data/outputs",
    tmpDir: "data/tmp",
    uploadStagingDir: "data/tmp/upload-staging",
    manifestPath: "data/manifest.json",
    uploadFileSizeLimitBytes: 123,
    maxConcurrentMediaJobs: 1,
    shutdownGracePeriodMs: 15000,
    minFreeStorageBytes: 536870912,
    maxManagedStorageBytes: 0,
    tempFileMaxAgeMs: 86400000,
    housekeepingIntervalMs: 3600000,
    mediaProcessTimeoutMs: 1_800_000,
    toolCommandTimeoutMs: 60_000,
    processKillGracePeriodMs: 5_000,
    maxCapturedProcessOutputBytes: 4 * 1024 * 1024,
    ytDlpJsRuntime: "node:C:\\Program Files\\nodejs\\node.exe",
    ...overrides
  };
}

describe("tool adapters", () => {
  it("runs ffprobe with exact JSON arguments and preserves spaced paths", async () => {
    const runner = new FakeProcessRunner();
    const probe = new FfprobeAdapter(createCommandRunner(runner, policy));
    const result = probe.probe("D:\\Video Files\\source video.mp4");

    runner.latest().emitStdout('{"streams":[],"format":{}}');
    runner.latest().emitClose(0);

    await expect(result).resolves.toEqual({ streams: [], format: {} });
    expect(runner.calls[0].args).toEqual([
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      "D:\\Video Files\\source video.mp4"
    ]);
  });

  it("propagates ffprobe non-zero exits and invalid JSON", async () => {
    const failedRunner = new FakeProcessRunner();
    const failed = new FfprobeAdapter(createCommandRunner(failedRunner, policy)).probe("source.mp4");
    failedRunner.latest().emitStderr("bad probe");
    failedRunner.latest().emitClose(1);
    await expect(failed).rejects.toThrow("bad probe");

    const invalidRunner = new FakeProcessRunner();
    const invalid = new FfprobeAdapter(createCommandRunner(invalidRunner, policy)).probe("source.mp4");
    invalidRunner.latest().emitStdout("not json");
    invalidRunner.latest().emitClose(0);
    await expect(invalid).rejects.toThrow();
  });

  it("detects ffmpeg encoders from stdout and stderr", async () => {
    const runner = new FakeProcessRunner();
    const capabilities = new ProcessFfmpegCapabilitiesAdapter(createCommandRunner(runner, policy)).getCapabilities();

    runner.latest().emitStdout(" V..... libx264 H.264\n A..... AAC\n");
    runner.latest().emitStderr(" V..... libaom-av1\n V..... libvpx-vp9\n A..... libopus\n");
    runner.latest().emitClose(0);

    await expect(capabilities).resolves.toEqual({
      libx264: true,
      libaomAv1: true,
      libvpxVp9: true,
      aac: true,
      libopus: true
    });
  });

  it("returns false ffmpeg capabilities on spawn error or empty encoders", async () => {
    const errorRunner = new FakeProcessRunner();
    const errorCapabilities = new ProcessFfmpegCapabilitiesAdapter(
      createCommandRunner(errorRunner, policy)
    ).getCapabilities();
    errorRunner.latest().emitError(new Error("missing"));
    await expect(errorCapabilities).resolves.toEqual({
      libx264: false,
      libaomAv1: false,
      libvpxVp9: false,
      aac: false,
      libopus: false
    });

    const emptyRunner = new FakeProcessRunner();
    const emptyCapabilities = new ProcessFfmpegCapabilitiesAdapter(
      createCommandRunner(emptyRunner, policy)
    ).getCapabilities();
    emptyRunner.latest().emitClose(0);
    await expect(emptyCapabilities).resolves.toEqual({
      libx264: false,
      libaomAv1: false,
      libvpxVp9: false,
      aac: false,
      libopus: false
    });
  });

  it("preserves command resolution order for whisper and yt-dlp", async () => {
    const runner = new FakeProcessRunner();
    const commandRunner = createCommandRunner(runner, policy);
    const whisper = new ConfigWhisperAdapter(config(), commandRunner).resolveCommand();
    runner.processes[0].emitError(new Error("missing"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    runner.processes[1].emitClose(1);

    await expect(whisper).resolves.toBe("main");
    expect(runner.calls.map((call) => [call.command, call.args])).toEqual([
      ["whisper-cli", ["--help"]],
      ["main", ["--help"]]
    ]);

    const ytRunner = new FakeProcessRunner();
    const yt = new YtDlpAdapter(
      config({ ytDlpBin: '"D:\\tools\\yt-dlp.exe"' }),
      createCommandRunner(ytRunner, policy),
      ytRunner,
      policy
    ).resolveCommand();
    ytRunner.latest().emitClose(0);

    await expect(yt).resolves.toBe("D:\\tools\\yt-dlp.exe");
    expect(ytRunner.calls[0]).toMatchObject({ command: "D:\\tools\\yt-dlp.exe", args: ["--version"] });
    expect(stripWrappingQuotes('"quoted"')).toBe("quoted");
  });

  it("times out yt-dlp imports, force terminates, cleans temporary directories, and preserves arguments", async () => {
    const tmp = await tempRoot();
    const runner = new FakeProcessRunner();
    const adapter = new YtDlpAdapter(
      config({ ytDlpBin: "yt-dlp" }),
      {
        async run() {
          return { stdout: "", stderr: "", code: 0 };
        },
        async runJson() {
          return {};
        },
        async commandExists() {
          return true;
        }
      },
      runner,
      { ...policy, timeoutMs: 20, terminationGracePeriodMs: 1 }
    );

    const download = adapter.download("https://example.test/video", tmp);
    download.catch(() => {});
    await waitForSpawn(runner);
    expect(runner.calls[0].args).toEqual([
      "--no-playlist",
      "--restrict-filenames",
      "--windows-filenames",
      "--newline",
      "--js-runtimes",
      "node:C:\\Program Files\\nodejs\\node.exe",
      "-f",
      "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
      "--merge-output-format",
      "mp4",
      "-o",
      expect.stringContaining("%(title).180B-%(id)s.%(ext)s"),
      "https://example.test/video"
    ]);

    await expect(download).rejects.toThrow("URL import timed out after 20 ms");
    expect(runner.processes[0].killSignals).toEqual(["SIGTERM", "SIGKILL"]);
    await expect(readdir(tmp)).resolves.toEqual([]);
  });
});
