import path from "node:path";

export type ApiConfig = {
  host: string;
  port: number;
  corsOrigin: string | true;
  storageRoot: string;
  uploadDir: string;
  outputDir: string;
  tmpDir: string;
  manifestPath: string;
  uploadFileSizeLimitBytes: number;
  whisperCppBin?: string;
  whisperCppModel?: string;
  ytDlpBin?: string;
  ytDlpJsRuntime: string;
};

export type ParseApiConfigOptions = {
  cwd: string;
  nodeExecPath: string;
};

export function parseApiConfig(source: Record<string, string | undefined>, options: ParseApiConfigOptions): ApiConfig {
  const rawPort = source.PORT ?? "4000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${rawPort}`);
  }

  const storageRoot = source.STORAGE_ROOT ?? path.resolve(options.cwd, "../../data");

  return {
    host: source.HOST ?? "0.0.0.0",
    port,
    corsOrigin: source.CORS_ORIGIN ?? true,
    storageRoot,
    uploadDir: path.join(storageRoot, "uploads"),
    outputDir: path.join(storageRoot, "outputs"),
    tmpDir: path.join(storageRoot, "tmp"),
    manifestPath: path.join(storageRoot, "manifest.json"),
    uploadFileSizeLimitBytes: 2 * 1024 * 1024 * 1024,
    whisperCppBin: source.WHISPER_CPP_BIN,
    whisperCppModel: source.WHISPER_CPP_MODEL,
    ytDlpBin: source.YT_DLP_BIN,
    ytDlpJsRuntime: source.YT_DLP_JS_RUNTIME?.trim() || `node:${options.nodeExecPath}`
  };
}
