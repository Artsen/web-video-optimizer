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
