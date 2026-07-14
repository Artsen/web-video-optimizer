import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseApiConfig } from "./config.js";

const options = {
  cwd: "D:\\repo\\apps\\api",
  nodeExecPath: "C:\\Program Files\\nodejs\\node.exe"
};

describe("parseApiConfig", () => {
  it("uses existing defaults", () => {
    const config = parseApiConfig({}, options);

    expect(config).toMatchObject({
      host: "0.0.0.0",
      port: 4000,
      corsOrigin: true,
      uploadFileSizeLimitBytes: 2 * 1024 * 1024 * 1024,
      maxConcurrentMediaJobs: 1,
      shutdownGracePeriodMs: 15000,
      mediaProcessTimeoutMs: 1800000,
      toolCommandTimeoutMs: 60000,
      processKillGracePeriodMs: 5000,
      maxCapturedProcessOutputBytes: 4194304,
      ytDlpJsRuntime: "node:C:\\Program Files\\nodejs\\node.exe"
    });
  });

  it("accepts an explicit host and port", () => {
    expect(parseApiConfig({ HOST: "127.0.0.1", PORT: "4100" }, options)).toMatchObject({
      host: "127.0.0.1",
      port: 4100
    });
  });

  it("rejects invalid ports", () => {
    expect(() => parseApiConfig({ PORT: "nope" }, options)).toThrow("Invalid PORT: nope");
    expect(() => parseApiConfig({ PORT: "70000" }, options)).toThrow("Invalid PORT: 70000");
  });

  it("accepts explicit media concurrency values", () => {
    expect(parseApiConfig({ MAX_CONCURRENT_MEDIA_JOBS: "1" }, options).maxConcurrentMediaJobs).toBe(1);
    expect(parseApiConfig({ MAX_CONCURRENT_MEDIA_JOBS: "3" }, options).maxConcurrentMediaJobs).toBe(3);
  });

  it("rejects invalid media concurrency values", () => {
    expect(() => parseApiConfig({ MAX_CONCURRENT_MEDIA_JOBS: "0" }, options)).toThrow(
      "Invalid MAX_CONCURRENT_MEDIA_JOBS: 0"
    );
    expect(() => parseApiConfig({ MAX_CONCURRENT_MEDIA_JOBS: "-1" }, options)).toThrow(
      "Invalid MAX_CONCURRENT_MEDIA_JOBS: -1"
    );
    expect(() => parseApiConfig({ MAX_CONCURRENT_MEDIA_JOBS: "1.5" }, options)).toThrow(
      "Invalid MAX_CONCURRENT_MEDIA_JOBS: 1.5"
    );
    expect(() => parseApiConfig({ MAX_CONCURRENT_MEDIA_JOBS: "many" }, options)).toThrow(
      "Invalid MAX_CONCURRENT_MEDIA_JOBS: many"
    );
    expect(() => parseApiConfig({ MAX_CONCURRENT_MEDIA_JOBS: "" }, options)).toThrow(
      "Invalid MAX_CONCURRENT_MEDIA_JOBS: "
    );
  });

  it("accepts and validates shutdown grace period values", () => {
    expect(parseApiConfig({ SHUTDOWN_GRACE_PERIOD_MS: "1" }, options).shutdownGracePeriodMs).toBe(1);
    expect(parseApiConfig({ SHUTDOWN_GRACE_PERIOD_MS: "30000" }, options).shutdownGracePeriodMs).toBe(30000);
    expect(() => parseApiConfig({ SHUTDOWN_GRACE_PERIOD_MS: "0" }, options)).toThrow(
      "Invalid SHUTDOWN_GRACE_PERIOD_MS: 0"
    );
    expect(() => parseApiConfig({ SHUTDOWN_GRACE_PERIOD_MS: "-1" }, options)).toThrow(
      "Invalid SHUTDOWN_GRACE_PERIOD_MS: -1"
    );
    expect(() => parseApiConfig({ SHUTDOWN_GRACE_PERIOD_MS: "1.5" }, options)).toThrow(
      "Invalid SHUTDOWN_GRACE_PERIOD_MS: 1.5"
    );
    expect(() => parseApiConfig({ SHUTDOWN_GRACE_PERIOD_MS: "soon" }, options)).toThrow(
      "Invalid SHUTDOWN_GRACE_PERIOD_MS: soon"
    );
  });

  it("accepts and validates process containment values", () => {
    expect(
      parseApiConfig(
        {
          MEDIA_PROCESS_TIMEOUT_MS: "100",
          TOOL_COMMAND_TIMEOUT_MS: "200",
          PROCESS_KILL_GRACE_PERIOD_MS: "300",
          MAX_CAPTURED_PROCESS_OUTPUT_BYTES: "400"
        },
        options
      )
    ).toMatchObject({
      mediaProcessTimeoutMs: 100,
      toolCommandTimeoutMs: 200,
      processKillGracePeriodMs: 300,
      maxCapturedProcessOutputBytes: 400
    });

    for (const variable of [
      "MEDIA_PROCESS_TIMEOUT_MS",
      "TOOL_COMMAND_TIMEOUT_MS",
      "PROCESS_KILL_GRACE_PERIOD_MS",
      "MAX_CAPTURED_PROCESS_OUTPUT_BYTES"
    ]) {
      for (const value of ["0", "-1", "1.5", "soon", ""]) {
        expect(() => parseApiConfig({ [variable]: value }, options)).toThrow(`Invalid ${variable}: ${value}`);
      }
    }
  });

  it("derives storage paths from an explicit storage root", () => {
    const storageRoot = "D:\\video-data";
    const config = parseApiConfig({ STORAGE_ROOT: storageRoot }, options);

    expect(config.storageRoot).toBe(storageRoot);
    expect(config.uploadDir).toBe(path.join(storageRoot, "uploads"));
    expect(config.outputDir).toBe(path.join(storageRoot, "outputs"));
    expect(config.tmpDir).toBe(path.join(storageRoot, "tmp"));
    expect(config.manifestPath).toBe(path.join(storageRoot, "manifest.json"));
  });

  it("preserves executable override configuration", () => {
    expect(
      parseApiConfig(
        {
          WHISPER_CPP_BIN: "D:\\whisper\\whisper-cli.exe",
          WHISPER_CPP_MODEL: "D:\\ggml-base.en.bin",
          YT_DLP_BIN: "D:\\tools\\yt-dlp.exe",
          YT_DLP_JS_RUNTIME: "node:D:\\node\\node.exe",
          CORS_ORIGIN: "http://localhost:5173"
        },
        options
      )
    ).toMatchObject({
      whisperCppBin: "D:\\whisper\\whisper-cli.exe",
      whisperCppModel: "D:\\ggml-base.en.bin",
      ytDlpBin: "D:\\tools\\yt-dlp.exe",
      ytDlpJsRuntime: "node:D:\\node\\node.exe",
      corsOrigin: "http://localhost:5173"
    });
  });
});
