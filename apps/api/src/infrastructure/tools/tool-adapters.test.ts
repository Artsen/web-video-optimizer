import { describe, expect, it } from "vitest";
import type { ApiConfig } from "../../config.js";
import { FakeProcessRunner } from "../processes/test/fake-process-runner.js";
import { createCommandRunner } from "./command-runner.js";
import { ProcessFfmpegCapabilitiesAdapter } from "./ffmpeg-capabilities-adapter.js";
import { FfprobeAdapter } from "./ffprobe-adapter.js";
import { ConfigWhisperAdapter } from "./whisper-adapter.js";
import { stripWrappingQuotes, YtDlpAdapter } from "./yt-dlp-adapter.js";

function config(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    host: "127.0.0.1",
    port: 4000,
    corsOrigin: true,
    storageRoot: "data",
    uploadDir: "data/uploads",
    outputDir: "data/outputs",
    tmpDir: "data/tmp",
    manifestPath: "data/manifest.json",
    uploadFileSizeLimitBytes: 123,
    ytDlpJsRuntime: "node:C:\\Program Files\\nodejs\\node.exe",
    ...overrides
  };
}

describe("tool adapters", () => {
  it("runs ffprobe with exact JSON arguments and preserves spaced paths", async () => {
    const runner = new FakeProcessRunner();
    const probe = new FfprobeAdapter(createCommandRunner(runner));
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
    const failed = new FfprobeAdapter(createCommandRunner(failedRunner)).probe("source.mp4");
    failedRunner.latest().emitStderr("bad probe");
    failedRunner.latest().emitClose(1);
    await expect(failed).rejects.toThrow("bad probe");

    const invalidRunner = new FakeProcessRunner();
    const invalid = new FfprobeAdapter(createCommandRunner(invalidRunner)).probe("source.mp4");
    invalidRunner.latest().emitStdout("not json");
    invalidRunner.latest().emitClose(0);
    await expect(invalid).rejects.toThrow();
  });

  it("detects ffmpeg encoders from stdout and stderr", async () => {
    const runner = new FakeProcessRunner();
    const capabilities = new ProcessFfmpegCapabilitiesAdapter(runner).getCapabilities();

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
    const errorCapabilities = new ProcessFfmpegCapabilitiesAdapter(errorRunner).getCapabilities();
    errorRunner.latest().emitError(new Error("missing"));
    await expect(errorCapabilities).resolves.toEqual({
      libx264: false,
      libaomAv1: false,
      libvpxVp9: false,
      aac: false,
      libopus: false
    });

    const emptyRunner = new FakeProcessRunner();
    const emptyCapabilities = new ProcessFfmpegCapabilitiesAdapter(emptyRunner).getCapabilities();
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
    const commandRunner = createCommandRunner(runner);
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
      createCommandRunner(ytRunner),
      ytRunner
    ).resolveCommand();
    ytRunner.latest().emitClose(0);

    await expect(yt).resolves.toBe("D:\\tools\\yt-dlp.exe");
    expect(ytRunner.calls[0]).toMatchObject({ command: "D:\\tools\\yt-dlp.exe", args: ["--version"] });
    expect(stripWrappingQuotes('"quoted"')).toBe("quoted");
  });
});
