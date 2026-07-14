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
  maxConcurrentMediaJobs: number;
  shutdownGracePeriodMs: number;
  mediaProcessTimeoutMs: number;
  toolCommandTimeoutMs: number;
  processKillGracePeriodMs: number;
  maxCapturedProcessOutputBytes: number;
  whisperCppBin?: string;
  whisperCppModel?: string;
  ytDlpBin?: string;
  ytDlpJsRuntime: string;
};

export type ParseApiConfigOptions = {
  cwd: string;
  nodeExecPath: string;
};

function parsePositiveInteger(source: Record<string, string | undefined>, name: string, defaultValue: string): number {
  const raw = source[name] ?? defaultValue;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return parsed;
}

export function parseApiConfig(source: Record<string, string | undefined>, options: ParseApiConfigOptions): ApiConfig {
  const rawPort = source.PORT ?? "4000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${rawPort}`);
  }

  const maxConcurrentMediaJobs = parsePositiveInteger(source, "MAX_CONCURRENT_MEDIA_JOBS", "1");
  const shutdownGracePeriodMs = parsePositiveInteger(source, "SHUTDOWN_GRACE_PERIOD_MS", "15000");
  const mediaProcessTimeoutMs = parsePositiveInteger(source, "MEDIA_PROCESS_TIMEOUT_MS", "1800000");
  const toolCommandTimeoutMs = parsePositiveInteger(source, "TOOL_COMMAND_TIMEOUT_MS", "60000");
  const processKillGracePeriodMs = parsePositiveInteger(source, "PROCESS_KILL_GRACE_PERIOD_MS", "5000");
  const maxCapturedProcessOutputBytes = parsePositiveInteger(source, "MAX_CAPTURED_PROCESS_OUTPUT_BYTES", "4194304");

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
    maxConcurrentMediaJobs,
    shutdownGracePeriodMs,
    mediaProcessTimeoutMs,
    toolCommandTimeoutMs,
    processKillGracePeriodMs,
    maxCapturedProcessOutputBytes,
    whisperCppBin: source.WHISPER_CPP_BIN,
    whisperCppModel: source.WHISPER_CPP_MODEL,
    ytDlpBin: source.YT_DLP_BIN,
    ytDlpJsRuntime: source.YT_DLP_JS_RUNTIME?.trim() || `node:${options.nodeExecPath}`
  };
}
