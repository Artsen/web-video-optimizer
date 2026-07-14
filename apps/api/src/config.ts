import path from "node:path";

export type ApiConfig = {
  host: string;
  port: number;
  allowLanAccess: boolean;
  corsOrigins: string[];
  jsonBodyLimitBytes: number;
  storageRoot: string;
  uploadDir: string;
  outputDir: string;
  tmpDir: string;
  uploadStagingDir: string;
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

function parseBoolean(source: Record<string, string | undefined>, name: string, defaultValue: string): boolean {
  const raw = source[name] ?? defaultValue;
  const normalized = raw.toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid ${name}: ${raw}`);
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host.toLowerCase() === "localhost" || host === "::1";
}

function isWildcardHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::";
}

function normalizeCorsOrigin(origin: string): string {
  const raw = origin.trim();
  if (!raw || raw === "*" || raw.toLowerCase() === "null") {
    throw new Error(`Invalid CORS_ORIGIN: ${origin}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid CORS_ORIGIN: ${origin}`);
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`Invalid CORS_ORIGIN: ${origin}`);
  }

  return parsed.origin;
}

function parseCorsOrigins(source: Record<string, string | undefined>): string[] {
  const raw = source.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173";
  const origins = raw.split(",").map(normalizeCorsOrigin);
  return Array.from(new Set(origins));
}

export function parseApiConfig(source: Record<string, string | undefined>, options: ParseApiConfigOptions): ApiConfig {
  const rawPort = source.PORT ?? "4000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${rawPort}`);
  }

  const host = source.HOST ?? "127.0.0.1";
  const allowLanAccess = parseBoolean(source, "ALLOW_LAN_ACCESS", "false");
  if (!allowLanAccess && (!isLoopbackHost(host) || isWildcardHost(host))) {
    throw new Error(`HOST requires ALLOW_LAN_ACCESS=true when binding outside loopback: ${host}`);
  }

  const maxConcurrentMediaJobs = parsePositiveInteger(source, "MAX_CONCURRENT_MEDIA_JOBS", "1");
  const jsonBodyLimitBytes = parsePositiveInteger(source, "JSON_BODY_LIMIT_BYTES", "5242880");
  const uploadFileSizeLimitBytes = parsePositiveInteger(source, "UPLOAD_FILE_SIZE_LIMIT_BYTES", "2147483648");
  const shutdownGracePeriodMs = parsePositiveInteger(source, "SHUTDOWN_GRACE_PERIOD_MS", "15000");
  const mediaProcessTimeoutMs = parsePositiveInteger(source, "MEDIA_PROCESS_TIMEOUT_MS", "1800000");
  const toolCommandTimeoutMs = parsePositiveInteger(source, "TOOL_COMMAND_TIMEOUT_MS", "60000");
  const processKillGracePeriodMs = parsePositiveInteger(source, "PROCESS_KILL_GRACE_PERIOD_MS", "5000");
  const maxCapturedProcessOutputBytes = parsePositiveInteger(source, "MAX_CAPTURED_PROCESS_OUTPUT_BYTES", "4194304");

  const storageRoot = source.STORAGE_ROOT ?? path.resolve(options.cwd, "../../data");

  return {
    host,
    port,
    allowLanAccess,
    corsOrigins: parseCorsOrigins(source),
    jsonBodyLimitBytes,
    storageRoot,
    uploadDir: path.join(storageRoot, "uploads"),
    outputDir: path.join(storageRoot, "outputs"),
    tmpDir: path.join(storageRoot, "tmp"),
    uploadStagingDir: path.join(storageRoot, "tmp", "upload-staging"),
    manifestPath: path.join(storageRoot, "manifest.json"),
    uploadFileSizeLimitBytes,
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
