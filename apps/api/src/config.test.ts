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
      host: "127.0.0.1",
      port: 4000,
      allowLanAccess: false,
      corsOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
      jsonBodyLimitBytes: 5242880,
      uploadFileSizeLimitBytes: 2 * 1024 * 1024 * 1024,
      maxConcurrentMediaJobs: 1,
      shutdownGracePeriodMs: 15000,
      minFreeStorageBytes: 536870912,
      maxManagedStorageBytes: 0,
      tempFileMaxAgeMs: 86400000,
      housekeepingIntervalMs: 3600000,
      mediaProcessTimeoutMs: 1800000,
      toolCommandTimeoutMs: 60000,
      processKillGracePeriodMs: 5000,
      maxCapturedProcessOutputBytes: 4194304,
      ytDlpJsRuntime: "node:C:\\Program Files\\nodejs\\node.exe"
    });
  });

  it("accepts an explicit loopback host and port", () => {
    expect(parseApiConfig({ HOST: "127.0.0.1", PORT: "4100" }, options)).toMatchObject({
      host: "127.0.0.1",
      port: 4100
    });
    expect(parseApiConfig({ HOST: "localhost" }, options).host).toBe("localhost");
    expect(parseApiConfig({ HOST: "::1" }, options).host).toBe("::1");
  });

  it("requires LAN opt-in for wildcard and non-loopback hosts", () => {
    expect(() => parseApiConfig({ HOST: "0.0.0.0" }, options)).toThrow(
      "HOST requires ALLOW_LAN_ACCESS=true when binding outside loopback: 0.0.0.0"
    );
    expect(() => parseApiConfig({ HOST: "::" }, options)).toThrow(
      "HOST requires ALLOW_LAN_ACCESS=true when binding outside loopback: ::"
    );
    expect(() => parseApiConfig({ HOST: "192.168.1.50" }, options)).toThrow(
      "HOST requires ALLOW_LAN_ACCESS=true when binding outside loopback: 192.168.1.50"
    );
  });

  it("accepts wildcard and explicit LAN hosts with opt-in", () => {
    expect(parseApiConfig({ HOST: "0.0.0.0", ALLOW_LAN_ACCESS: "true" }, options)).toMatchObject({
      host: "0.0.0.0",
      allowLanAccess: true
    });
    expect(parseApiConfig({ HOST: "::", ALLOW_LAN_ACCESS: "TRUE" }, options)).toMatchObject({
      host: "::",
      allowLanAccess: true
    });
    expect(parseApiConfig({ HOST: "192.168.1.50", ALLOW_LAN_ACCESS: "true" }, options)).toMatchObject({
      host: "192.168.1.50",
      allowLanAccess: true
    });
  });

  it("parses LAN access booleans strictly", () => {
    expect(parseApiConfig({ ALLOW_LAN_ACCESS: "false" }, options).allowLanAccess).toBe(false);
    expect(parseApiConfig({ ALLOW_LAN_ACCESS: "FALSE" }, options).allowLanAccess).toBe(false);
    for (const value of ["yes", "1", "enabled", ""]) {
      expect(() => parseApiConfig({ ALLOW_LAN_ACCESS: value }, options)).toThrow(`Invalid ALLOW_LAN_ACCESS: ${value}`);
    }
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

  it("parses CORS origins as an exact normalized allowlist", () => {
    expect(
      parseApiConfig(
        {
          CORS_ORIGIN: " http://localhost:5173 ,http://127.0.0.1:5173,http://localhost:5173,http://localhost:5173/ "
        },
        options
      ).corsOrigins
    ).toEqual(["http://localhost:5173", "http://127.0.0.1:5173"]);
  });

  it("accepts multiple HTTPS CORS origins", () => {
    expect(
      parseApiConfig({ CORS_ORIGIN: "https://example.com,https://video.example.com:8443" }, options).corsOrigins
    ).toEqual(["https://example.com", "https://video.example.com:8443"]);
  });

  it("rejects invalid CORS origins", () => {
    for (const value of [
      "*",
      "null",
      "file:///tmp",
      "javascript:alert(1)",
      "https://user:pass@example.com",
      "https://example.com/path",
      "https://example.com?x=1",
      "https://example.com#frag",
      ""
    ]) {
      expect(() => parseApiConfig({ CORS_ORIGIN: value }, options)).toThrow(`Invalid CORS_ORIGIN: ${value}`);
    }
  });

  it("accepts and validates JSON body limits", () => {
    expect(parseApiConfig({ JSON_BODY_LIMIT_BYTES: "1024" }, options).jsonBodyLimitBytes).toBe(1024);
    for (const value of ["0", "-1", "1.5", "many", ""]) {
      expect(() => parseApiConfig({ JSON_BODY_LIMIT_BYTES: value }, options)).toThrow(
        `Invalid JSON_BODY_LIMIT_BYTES: ${value}`
      );
    }
  });

  it("accepts and validates upload file size limits separately from JSON limits", () => {
    expect(parseApiConfig({ UPLOAD_FILE_SIZE_LIMIT_BYTES: "1024" }, options).uploadFileSizeLimitBytes).toBe(1024);
    for (const value of ["0", "-1", "1.5", "many", ""]) {
      expect(() => parseApiConfig({ UPLOAD_FILE_SIZE_LIMIT_BYTES: value }, options)).toThrow(
        `Invalid UPLOAD_FILE_SIZE_LIMIT_BYTES: ${value}`
      );
    }
  });

  it("accepts and validates storage capacity and housekeeping values", () => {
    expect(
      parseApiConfig(
        {
          MIN_FREE_STORAGE_BYTES: "1024",
          MAX_MANAGED_STORAGE_BYTES: "2048",
          TEMP_FILE_MAX_AGE_MS: "3000",
          HOUSEKEEPING_INTERVAL_MS: "4000"
        },
        options
      )
    ).toMatchObject({
      minFreeStorageBytes: 1024,
      maxManagedStorageBytes: 2048,
      tempFileMaxAgeMs: 3000,
      housekeepingIntervalMs: 4000
    });
    expect(parseApiConfig({ MAX_MANAGED_STORAGE_BYTES: "0" }, options).maxManagedStorageBytes).toBe(0);

    for (const variable of ["MIN_FREE_STORAGE_BYTES", "TEMP_FILE_MAX_AGE_MS", "HOUSEKEEPING_INTERVAL_MS"]) {
      for (const value of ["0", "-1", "1.5", "many", "", String(Number.MAX_SAFE_INTEGER + 2)]) {
        expect(() => parseApiConfig({ [variable]: value }, options)).toThrow(`Invalid ${variable}: ${value}`);
      }
    }

    for (const value of ["-1", "1.5", "many", "", String(Number.MAX_SAFE_INTEGER + 2)]) {
      expect(() => parseApiConfig({ MAX_MANAGED_STORAGE_BYTES: value }, options)).toThrow(
        `Invalid MAX_MANAGED_STORAGE_BYTES: ${value}`
      );
    }
  });

  it("derives storage paths from an explicit storage root", () => {
    const storageRoot = "D:\\video-data";
    const config = parseApiConfig({ STORAGE_ROOT: storageRoot }, options);

    expect(config.storageRoot).toBe(storageRoot);
    expect(config.uploadDir).toBe(path.join(storageRoot, "uploads"));
    expect(config.outputDir).toBe(path.join(storageRoot, "outputs"));
    expect(config.tmpDir).toBe(path.join(storageRoot, "tmp"));
    expect(config.uploadStagingDir).toBe(path.join(storageRoot, "tmp", "upload-staging"));
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
      corsOrigins: ["http://localhost:5173"]
    });
  });
});
