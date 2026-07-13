import fs from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import type { Capabilities, JobDto, JobKind, OptimizationSettings } from "@local-video-optimizer/contracts";
import {
  assertLooksLikeVtt,
  buildFfmpegArgs,
  normalizeOptimizationSettings,
  normalizeProbe,
  sanitizeFileName,
  shiftCaptionTimings,
  vttToSrt
} from "@local-video-optimizer/video-core";
import type { FFprobeResult } from "@local-video-optimizer/video-core";
import type { ApiConfig } from "../config.js";
import { toHistorySnapshotDto } from "../dto/history-dto.js";
import { toJobDto } from "../dto/job-dto.js";
import { toVideoRecordDto } from "../dto/video-dto.js";
import type { JobEntity } from "../entities/job-entity.js";
import type { ManifestSnapshot } from "../entities/manifest.js";
import type { VideoEntity } from "../entities/video-entity.js";
import { FileManifestStore } from "../persistence/file-manifest-store.js";
import type { ManifestStore } from "../persistence/manifest-store.js";
import { InMemoryJobRepository } from "../repositories/in-memory-job-repository.js";
import { InMemoryVideoRepository } from "../repositories/in-memory-video-repository.js";
import type { JobRepository, VideoRepository } from "../repositories/repository-types.js";
import type { ApiRuntime, UploadedVideoFile } from "./api-runtime.js";

const mkdir = promisify(fs.mkdir);
const rm = promisify(fs.rm);
const stat = promisify(fs.stat);

type VideoRecord = VideoEntity;
type Job = JobEntity;

type ProcessHandle = ReturnType<typeof spawn>;

type RuntimeContext = {
  config: ApiConfig;
  uploadDir: string;
  outputDir: string;
  tmpDir: string;
  videoRepository: VideoRepository;
  jobRepository: JobRepository;
  manifestStore: ManifestStore;
  processes: Map<string, ProcessHandle>;
};

export type ProductionRuntimeDependencies = {
  videoRepository?: VideoRepository;
  jobRepository?: JobRepository;
  manifestStore?: ManifestStore;
};

async function fileHash(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function removeJobArtifacts(job: Job): Promise<void> {
  if (job.outputPath) await rm(job.outputPath, { force: true, maxRetries: 5, retryDelay: 150 });
  if (job.sidecarPath) await rm(job.sidecarPath, { force: true, maxRetries: 5, retryDelay: 150 });
}

async function removeJob(ctx: RuntimeContext, job: Job): Promise<void> {
  ctx.processes.get(job.id)?.kill("SIGTERM");
  ctx.processes.delete(job.id);
  await removeJobArtifacts(job);
  ctx.jobRepository.delete(job.id);
}

async function removeVideoRecord(ctx: RuntimeContext, video: VideoRecord): Promise<void> {
  await rm(video.storedPath, { force: true, maxRetries: 5, retryDelay: 150 });
  for (const job of ctx.jobRepository.findByVideoId(video.id)) {
    if (job.videoId === video.id) {
      await removeJob(ctx, job);
    }
  }
  ctx.videoRepository.delete(video.id);
}

async function pruneDirectory(directory: string, keepPaths: Set<string>): Promise<void> {
  if (!fs.existsSync(directory)) return;
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (keepPaths.has(path.resolve(fullPath))) return;
      await rm(fullPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    })
  );
}

async function pruneOrphanFiles(ctx: RuntimeContext): Promise<void> {
  const uploadKeep = new Set(ctx.videoRepository.getAll().map((video) => path.resolve(video.storedPath)));
  const outputKeep = new Set<string>();
  for (const job of ctx.jobRepository.getAll()) {
    if (job.outputPath) outputKeep.add(path.resolve(job.outputPath));
    if (job.sidecarPath) outputKeep.add(path.resolve(job.sidecarPath));
  }
  await Promise.all([
    pruneDirectory(ctx.uploadDir, uploadKeep),
    pruneDirectory(ctx.outputDir, outputKeep),
    pruneDirectory(ctx.tmpDir, new Set())
  ]);
}

async function createVideoRecordFromFile(
  ctx: RuntimeContext,
  filePath: string,
  originalName: string,
  uploadedAt = new Date().toISOString()
): Promise<VideoRecord> {
  const sourceHash = await fileHash(filePath);
  const existing = ctx.videoRepository.findBySourceHash(sourceHash);
  if (existing) {
    await rm(filePath, { force: true, maxRetries: 5, retryDelay: 150 });
    return existing;
  }

  const id = nanoid();
  const extension = path.extname(originalName) || path.extname(filePath) || ".mp4";
  const storedPath = path.join(ctx.uploadDir, `${id}${extension}`);
  await fs.promises.rename(filePath, storedPath);

  const probe = await ffprobe(storedPath);
  const record: VideoRecord = {
    id,
    originalName,
    storedPath,
    uploadedAt,
    sourceHash,
    metadata: normalizeProbe(originalName, probe)
  };
  ctx.videoRepository.set(record);
  await saveManifest(ctx);
  return record;
}

async function downloadVideoFromUrl(ctx: RuntimeContext, url: string): Promise<VideoRecord> {
  const ytDlpCommand = await resolveYtDlpCommand(ctx.config);
  if (!ytDlpCommand) {
    throw new Error("yt-dlp was not found. Install yt-dlp or set YT_DLP_BIN to enable URL imports.");
  }

  const importId = nanoid();
  const downloadDir = path.join(ctx.tmpDir, `url-import-${importId}`);
  await mkdir(downloadDir, { recursive: true });
  const outputTemplate = path.join(downloadDir, "%(title).180B-%(id)s.%(ext)s");

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        ytDlpCommand,
        [
          "--no-playlist",
          "--restrict-filenames",
          "--windows-filenames",
          "--newline",
          ...ytDlpJsRuntimeArgs(ctx.config),
          "-f",
          "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
          "--merge-output-format",
          "mp4",
          "-o",
          outputTemplate,
          url
        ],
        { windowsHide: true }
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n").slice(-2000);
        reject(new Error(detail || `yt-dlp exited with code ${code}`));
      });
    });
  } catch (error) {
    await rm(downloadDir, { recursive: true, force: true });
    throw error;
  }

  const files = (await fs.promises.readdir(downloadDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(downloadDir, entry.name));
  const videoFile = files.find((file) => /\.(mp4|webm|mkv|mov|m4v)$/i.test(file)) ?? files[0];
  if (!videoFile) {
    await rm(downloadDir, { recursive: true, force: true });
    throw new Error("yt-dlp did not create a downloadable video file.");
  }

  const importPath = path.join(ctx.tmpDir, `${importId}-${path.basename(videoFile)}`);
  await fs.promises.rename(videoFile, importPath);
  await rm(downloadDir, { recursive: true, force: true });
  return createVideoRecordFromFile(ctx, importPath, path.basename(importPath));
}

async function mergeDuplicateVideos(ctx: RuntimeContext): Promise<void> {
  const byHash = new Map<string, VideoRecord>();
  for (const video of ctx.videoRepository.getAll().sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))) {
    if (!video.sourceHash) continue;
    const keeper = byHash.get(video.sourceHash);
    if (!keeper) {
      byHash.set(video.sourceHash, video);
      continue;
    }

    for (const job of ctx.jobRepository.getAll()) {
      if (job.videoId === video.id) {
        job.videoId = keeper.id;
      }
    }
    await rm(video.storedPath, { force: true, maxRetries: 5, retryDelay: 150 });
    ctx.videoRepository.delete(video.id);
  }
}

async function saveManifest(ctx: RuntimeContext): Promise<void> {
  const manifest: ManifestSnapshot = {
    videos: ctx.videoRepository.getAll(),
    jobs: ctx.jobRepository
      .getAll()
      .filter((job) => job.status !== "canceled")
      .map((job) => ({
        ...job,
        status: job.status === "running" || job.status === "queued" ? "canceled" : job.status,
        message: job.status === "running" || job.status === "queued" ? "Canceled by API restart" : job.message
      }))
  };

  await ctx.manifestStore.save(manifest);
}

async function loadManifest(ctx: RuntimeContext): Promise<void> {
  const manifest = await ctx.manifestStore.load();
  if (!manifest) return;

  for (const video of manifest.videos ?? []) {
    if (fs.existsSync(video.storedPath)) {
      ctx.videoRepository.set({
        ...video,
        sourceHash: video.sourceHash ?? (await fileHash(video.storedPath))
      });
    }
  }

  for (const job of manifest.jobs ?? []) {
    if (job.status === "canceled" || job.status === "running" || job.status === "queued") continue;
    const restored: Job = {
      ...job,
      status: job.status,
      message: job.message
    };
    if (!restored.outputPath || fs.existsSync(restored.outputPath)) {
      ctx.jobRepository.set(restored);
    }
  }
}

async function runJsonCommand(command: string, args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `${command} exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function ffprobe(filePath: string): Promise<FFprobeResult> {
  return runJsonCommand("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath
  ]) as Promise<FFprobeResult>;
}

async function ffmpegCapabilities(): Promise<
  Pick<Capabilities, "libx264" | "libaomAv1" | "libvpxVp9" | "aac" | "libopus">
> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-encoders"], { windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("close", () => {
      resolve({
        libx264: output.includes("libx264"),
        libaomAv1: output.includes("libaom-av1"),
        libvpxVp9: output.includes("libvpx-vp9"),
        aac: /\bAAC\b| aac\s/.test(output),
        libopus: output.includes("libopus")
      });
    });
    child.on("error", () => {
      resolve({ libx264: false, libaomAv1: false, libvpxVp9: false, aac: false, libopus: false });
    });
  });
}

async function commandExists(command: string, args = ["--help"]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    child.on("error", () => resolve(false));
    child.on("close", () => resolve(true));
  });
}

async function speechCapabilities(config: ApiConfig): Promise<{
  whisperCpp: boolean;
  whisperModel: boolean;
  whisperCommand?: string;
  whisperModelPath?: string;
}> {
  const configuredModel = config.whisperCppModel;
  const whisperCommand = await resolveWhisperCommand(config);

  return {
    whisperCpp: Boolean(whisperCommand),
    whisperModel: Boolean(configuredModel && fs.existsSync(configuredModel)),
    whisperCommand,
    whisperModelPath: configuredModel
  };
}

async function downloaderCapabilities(
  config: ApiConfig
): Promise<{ ytDlp: boolean; ytDlpCommand?: string; ytDlpJsRuntime?: string }> {
  const ytDlpCommand = await resolveYtDlpCommand(config);
  return {
    ytDlp: Boolean(ytDlpCommand),
    ytDlpCommand,
    ytDlpJsRuntime: ytDlpJsRuntimeValue(config)
  };
}

async function resolveWhisperCommand(config: ApiConfig): Promise<string | undefined> {
  const configuredCommand = config.whisperCppBin;
  const candidates = configuredCommand ? [configuredCommand] : ["whisper-cli", "main", "whisper-cpp"];
  for (const candidate of candidates) {
    if (await commandExists(candidate)) return candidate;
  }
  return undefined;
}

async function resolveYtDlpCommand(config: ApiConfig): Promise<string | undefined> {
  const configuredCommand = config.ytDlpBin;
  const candidates = configuredCommand ? [stripWrappingQuotes(configuredCommand)] : ["yt-dlp", "yt-dlp.exe"];
  for (const candidate of candidates) {
    if (await commandExists(candidate, ["--version"])) return candidate;
  }
  return undefined;
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^"|"$/g, "");
}

function ytDlpJsRuntimeValue(config: ApiConfig): string {
  return stripWrappingQuotes(config.ytDlpJsRuntime);
}

function ytDlpJsRuntimeArgs(config: ApiConfig): string[] {
  return ["--js-runtimes", ytDlpJsRuntimeValue(config)];
}

function publicJob(job: Job): JobDto {
  return toJobDto(job);
}

function renamedOutputFileName(currentName: string, nextName: string): string {
  const cleanName = sanitizeFileName(path.parse(nextName).name);
  const currentExtension = path.extname(currentName);
  const requestedExtension = path.extname(nextName);
  const extension =
    requestedExtension && requestedExtension.toLowerCase() === currentExtension.toLowerCase()
      ? requestedExtension
      : currentExtension;
  return `${cleanName || path.parse(currentName).name}${extension}`;
}

function revealInFileManager(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const directory = path.dirname(filePath);
    let command: string;
    let args: string[];

    if (process.platform === "win32") {
      command = "explorer.exe";
      args = [`/select,${filePath}`];
    } else if (process.platform === "darwin") {
      command = "open";
      args = ["-R", filePath];
    } else {
      command = "xdg-open";
      args = [directory];
    }

    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", reject);
    child.unref();
    resolve();
  });
}

function historySnapshot(ctx: RuntimeContext) {
  return toHistorySnapshotDto(ctx.videoRepository.getAll(), ctx.jobRepository.getAll());
}

function commandPreview(args: string[]): string {
  return ["ffmpeg", ...args].map((part) => (part.includes(" ") ? `"${part}"` : part)).join(" ");
}

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function dosDateTime(date = new Date()): { date: number; time: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function createZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const stamp = dosDateTime();

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, "/"));
    const data = entry.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(stamp.time, 12);
    centralHeader.writeUInt16LE(stamp.date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += local.length + name.length + data.length;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, ...central, end]);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function jsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function compactJsonObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== "")
  ) as T;
}

function isoDuration(seconds: number): string | undefined {
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${secs || (!hours && !minutes) ? `${secs}S` : ""}`;
}

function transcriptFromVtt(vtt: string): string {
  return vtt
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^WEBVTT\b/i.test(line) &&
        !/^NOTE\b/i.test(line) &&
        !/^\d+$/.test(line) &&
        !line.includes("-->") &&
        !/^\[(?:BLANK_AUDIO|MUSIC|SILENCE|NOISE|APPLAUSE|LAUGHTER)\]$/i.test(line)
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function cleanCaptionText(text: string): string {
  const seen = new Set<string>();
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !/^\[(?:BLANK_AUDIO|MUSIC|SILENCE|NOISE|APPLAUSE|LAUGHTER)\]$/i.test(line))
    .filter((line) => {
      if (!line || line.includes("-->") || /^WEBVTT\b/i.test(line) || /^NOTE\b/i.test(line) || /^\d+$/.test(line))
        return true;
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function createEncodeJob(
  ctx: RuntimeContext,
  video: VideoRecord,
  settings: OptimizationSettings,
  kind: JobKind,
  suffix = "optimized"
): Job {
  const jobId = nanoid();
  const baseName = sanitizeFileName(settings.outputFilename || `${path.parse(video.originalName).name}-${suffix}`);
  const extension = settings.outputContainer === "webm" ? ".webm" : ".mp4";
  const outputFileName = `${baseName}${extension}`;
  const outputPath = path.join(ctx.outputDir, `${jobId}-${outputFileName}`);
  const args = buildFfmpegArgs(video.storedPath, outputPath, settings);
  const job: Job = {
    id: jobId,
    videoId: video.id,
    status: "queued",
    kind,
    progress: 0,
    outputPath,
    outputFileName,
    ffmpegCommand: commandPreview(args),
    startedAt: new Date().toISOString(),
    settings
  };

  ctx.jobRepository.set(job);
  void saveManifest(ctx);
  return job;
}

function matchingSettings(a: OptimizationSettings, b: OptimizationSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function reusableJob(
  ctx: RuntimeContext,
  video: VideoRecord,
  kind: Job["kind"],
  settings: OptimizationSettings
): Job | undefined {
  return ctx.jobRepository
    .getAll()
    .find(
      (job) =>
        job.videoId === video.id &&
        job.kind === kind &&
        (job.status === "queued" || job.status === "running" || job.status === "completed") &&
        matchingSettings(job.settings, settings) &&
        (!job.outputPath || job.status !== "completed" || fs.existsSync(job.outputPath))
    );
}

function createSubtitleJob(ctx: RuntimeContext, video: VideoRecord): Job {
  const jobId = nanoid();
  const baseName = sanitizeFileName(`${path.parse(video.originalName).name}-captions`);
  const outputFileName = `${baseName}.vtt`;
  const sidecarFileName = `${baseName}.srt`;
  const outputBasePath = path.join(ctx.outputDir, `${jobId}-${baseName}`);
  const outputPath = `${outputBasePath}.vtt`;
  const sidecarPath = `${outputBasePath}.srt`;
  const settings = normalizeOptimizationSettings({ outputFilename: baseName });
  const job: Job = {
    id: jobId,
    videoId: video.id,
    status: "queued",
    kind: "subtitle",
    progress: 0,
    outputPath,
    outputFileName,
    sidecarPath,
    sidecarFileName,
    ffmpegCommand: "",
    startedAt: new Date().toISOString(),
    settings
  };

  ctx.jobRepository.set(job);
  void saveManifest(ctx);
  return job;
}

function detectLeadingSilence(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    const args = [
      "-hide_banner",
      "-nostats",
      "-i",
      inputPath,
      "-af",
      "silencedetect=noise=-35dB:d=0.35",
      "-f",
      "null",
      "-"
    ];
    const child = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", () => resolve(0));
    child.on("close", () => {
      const firstStart = stderr.match(/silence_start:\s*([0-9.]+)/);
      const firstEnd = stderr.match(/silence_end:\s*([0-9.]+)/);
      const silenceStart = firstStart ? Number(firstStart[1]) : undefined;
      const silenceEnd = firstEnd ? Number(firstEnd[1]) : undefined;
      if (
        silenceStart !== undefined &&
        silenceStart <= 0.25 &&
        silenceEnd !== undefined &&
        Number.isFinite(silenceEnd)
      ) {
        resolve(Math.max(0, Math.round(silenceEnd * 1000) / 1000));
        return;
      }
      resolve(0);
    });
  });
}

function createMuxJob(ctx: RuntimeContext, video: VideoRecord, videoJob: Job, subtitleJob: Job): Job {
  const jobId = nanoid();
  const parsed = path.parse(videoJob.outputFileName ?? video.originalName);
  const extension = parsed.ext || (videoJob.settings.outputContainer === "webm" ? ".webm" : ".mp4");
  const baseName = sanitizeFileName(`${parsed.name || path.parse(video.originalName).name}-captioned`);
  const outputFileName = `${baseName}${extension}`;
  const outputPath = path.join(ctx.outputDir, `${jobId}-${outputFileName}`);
  const settings = normalizeOptimizationSettings({ ...videoJob.settings, outputFilename: baseName });
  const args = buildMuxSubtitleArgs(
    videoJob.outputPath!,
    subtitleJob.outputPath!,
    outputPath,
    settings.outputContainer
  );
  const job: Job = {
    id: jobId,
    videoId: video.id,
    status: "queued",
    kind: "mux",
    progress: 0,
    outputPath,
    outputFileName,
    ffmpegCommand: commandPreview(args),
    startedAt: new Date().toISOString(),
    settings
  };

  ctx.jobRepository.set(job);
  void saveManifest(ctx);
  return job;
}

function buildMuxSubtitleArgs(
  inputPath: string,
  subtitlePath: string,
  outputPath: string,
  container: OptimizationSettings["outputContainer"]
): string[] {
  const args = ["-y", "-i", inputPath, "-i", subtitlePath, "-map", "0", "-map", "1:0", "-c", "copy"];
  args.push("-c:s", container === "mp4" ? "mov_text" : "webvtt");
  args.push("-metadata:s:s:0", "language=eng", "-disposition:s:0", "default");
  if (container === "mp4") args.push("-movflags", "+faststart");
  args.push(outputPath);
  return args;
}

function runMuxJob(ctx: RuntimeContext, job: Job, videoJob: Job, subtitleJob: Job): void {
  const args = [
    "-progress",
    "pipe:1",
    "-nostats",
    ...buildMuxSubtitleArgs(
      videoJob.outputPath!,
      subtitleJob.outputPath!,
      job.outputPath!,
      job.settings.outputContainer
    )
  ];
  const child = spawn("ffmpeg", args, { windowsHide: true });
  ctx.processes.set(job.id, child);
  job.status = "running";
  job.message = "Embedding subtitle track";

  child.stdout.on("data", (chunk) => {
    const text = String(chunk);
    const outTimeMs = text.match(/out_time_ms=(\d+)/);
    const sourceDuration = ctx.videoRepository.get(job.videoId)?.metadata.durationSeconds ?? 0;
    if (outTimeMs && sourceDuration > 0) {
      const elapsed = Number(outTimeMs[1]) / 1_000_000;
      job.progress = Math.min(99, Math.round((elapsed / sourceDuration) * 100));
      job.message = `Embedding captions ${job.progress}%`;
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text && job.status === "running") {
      job.message = text.split("\n").at(-1)?.slice(0, 220) || job.message;
    }
  });

  child.on("error", (error) => {
    job.status = "failed";
    job.message = error.message;
    job.completedAt = new Date().toISOString();
    ctx.processes.delete(job.id);
    void removeJobArtifacts(job);
    void saveManifest(ctx);
  });

  child.on("close", async (code) => {
    ctx.processes.delete(job.id);
    job.completedAt = new Date().toISOString();
    if (job.status === "canceled") {
      job.progress = 0;
      job.message = "Canceled";
      void saveManifest(ctx);
      return;
    }
    if (code !== 0) {
      job.status = "failed";
      job.message = `FFmpeg exited with code ${code}`;
      await removeJobArtifacts(job);
      void saveManifest(ctx);
      return;
    }

    job.status = "completed";
    job.progress = 100;
    job.message = "Captions embedded";
    job.outputSize = (await stat(job.outputPath!)).size;
    void saveManifest(ctx);
  });
}

async function runSubtitleJob(ctx: RuntimeContext, job: Job, inputPath: string): Promise<void> {
  const whisperCommand = await resolveWhisperCommand(ctx.config);
  const whisperModel = ctx.config.whisperCppModel;
  const audioPath = path.join(ctx.tmpDir, `${job.id}-subtitle.wav`);
  const outputBasePath = job.outputPath!.replace(/\.vtt$/i, "");

  job.status = "running";
  job.progress = 3;
  job.message = "Checking leading silence";

  if (!whisperCommand) {
    job.status = "failed";
    job.message = "whisper.cpp executable was not found. Set WHISPER_CPP_BIN or add whisper-cli to PATH.";
    job.completedAt = new Date().toISOString();
    void removeJobArtifacts(job);
    void saveManifest(ctx);
    return;
  }

  if (!whisperModel) {
    job.status = "failed";
    job.message = "WHISPER_CPP_MODEL is not configured";
    job.completedAt = new Date().toISOString();
    void removeJobArtifacts(job);
    void saveManifest(ctx);
    return;
  }

  const leadingSilenceSeconds = await detectLeadingSilence(inputPath);
  if (ctx.jobRepository.get(job.id)?.status === "canceled") {
    job.progress = 0;
    job.message = "Canceled";
    job.completedAt = new Date().toISOString();
    void saveManifest(ctx);
    return;
  }
  const extractArgs = [
    "-y",
    ...(leadingSilenceSeconds > 0 ? ["-ss", String(leadingSilenceSeconds)] : []),
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    audioPath
  ];
  const whisperArgs = ["-m", whisperModel, "-f", audioPath, "-osrt", "-ovtt", "-of", outputBasePath];

  job.progress = 8;
  job.message =
    leadingSilenceSeconds > 0
      ? `Detected ${leadingSilenceSeconds.toFixed(2)}s leading silence`
      : "Extracting audio for subtitles";
  job.ffmpegCommand = `${commandPreview(extractArgs)} && ${[whisperCommand, ...whisperArgs].map((part) => (part.includes(" ") ? `"${part}"` : part)).join(" ")}`;
  void saveManifest(ctx);

  const extractor = spawn("ffmpeg", extractArgs, { windowsHide: true });
  ctx.processes.set(job.id, extractor);

  extractor.on("error", (error) => {
    job.status = "failed";
    job.message = error.message;
    job.completedAt = new Date().toISOString();
    ctx.processes.delete(job.id);
    void removeJobArtifacts(job);
    void saveManifest(ctx);
  });

  extractor.on("close", (code) => {
    if (job.status === "canceled") {
      ctx.processes.delete(job.id);
      void fs.promises.rm(audioPath, { force: true });
      void saveManifest(ctx);
      return;
    }
    if (code !== 0) {
      job.status = "failed";
      job.message = `Audio extraction exited with code ${code}`;
      job.completedAt = new Date().toISOString();
      ctx.processes.delete(job.id);
      void removeJobArtifacts(job);
      void saveManifest(ctx);
      return;
    }

    job.progress = 35;
    job.message = "Transcribing speech with whisper.cpp";
    const whisper = spawn(whisperCommand, whisperArgs, { windowsHide: true });
    ctx.processes.set(job.id, whisper);

    whisper.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text && job.status === "running") {
        job.message = text.split("\n").at(-1)?.slice(0, 220) || job.message;
      }
    });

    whisper.on("error", (error) => {
      job.status = "failed";
      job.message = error.message;
      job.completedAt = new Date().toISOString();
      ctx.processes.delete(job.id);
      void fs.promises.rm(audioPath, { force: true });
      void removeJobArtifacts(job);
      void saveManifest(ctx);
    });

    whisper.on("close", async (whisperCode) => {
      ctx.processes.delete(job.id);
      await fs.promises.rm(audioPath, { force: true });
      job.completedAt = new Date().toISOString();
      if (job.status === "canceled") {
        job.progress = 0;
        job.message = "Canceled";
        void saveManifest(ctx);
        return;
      }
      if (whisperCode !== 0) {
        job.status = "failed";
        job.message = `whisper.cpp exited with code ${whisperCode}`;
        await removeJobArtifacts(job);
        void saveManifest(ctx);
        return;
      }
      if (!fs.existsSync(job.outputPath!)) {
        job.status = "failed";
        job.message = "whisper.cpp did not create a VTT file";
        await removeJobArtifacts(job);
        void saveManifest(ctx);
        return;
      }

      if (leadingSilenceSeconds > 0) {
        const vtt = await fs.promises.readFile(job.outputPath!, "utf8");
        await fs.promises.writeFile(job.outputPath!, shiftCaptionTimings(vtt, leadingSilenceSeconds));
        if (job.sidecarPath && fs.existsSync(job.sidecarPath)) {
          const srt = await fs.promises.readFile(job.sidecarPath, "utf8");
          await fs.promises.writeFile(job.sidecarPath, shiftCaptionTimings(srt, leadingSilenceSeconds));
        }
      }

      job.status = "completed";
      job.progress = 100;
      job.message =
        leadingSilenceSeconds > 0
          ? `Subtitles generated with ${leadingSilenceSeconds.toFixed(2)}s leading-silence compensation`
          : "Subtitles generated";
      job.outputSize = (await stat(job.outputPath!)).size;
      void saveManifest(ctx);
    });
  });
}

function runPosterJob(ctx: RuntimeContext, job: Job, inputPath: string, atSeconds: number): void {
  const args = [
    "-y",
    "-ss",
    String(atSeconds),
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "82",
    job.outputPath!
  ];
  const child = spawn("ffmpeg", args, { windowsHide: true });
  ctx.processes.set(job.id, child);
  job.status = "running";
  job.message = "Generating poster";
  job.ffmpegCommand = commandPreview(args);

  child.on("error", (error) => {
    job.status = "failed";
    job.message = error.message;
    job.completedAt = new Date().toISOString();
    ctx.processes.delete(job.id);
    void removeJobArtifacts(job);
    void saveManifest(ctx);
  });

  child.on("close", async (code) => {
    ctx.processes.delete(job.id);
    job.completedAt = new Date().toISOString();
    if (job.status === "canceled") {
      job.message = "Canceled";
      void saveManifest(ctx);
      return;
    }
    if (code !== 0) {
      job.status = "failed";
      job.message = `FFmpeg exited with code ${code}`;
      await removeJobArtifacts(job);
      void saveManifest(ctx);
      return;
    }
    job.status = "completed";
    job.progress = 100;
    job.message = "Poster generated";
    job.outputSize = (await stat(job.outputPath!)).size;
    void saveManifest(ctx);
  });
}

function runJob(ctx: RuntimeContext, job: Job, inputPath: string, durationLimitSeconds?: number): void {
  const args = [
    "-progress",
    "pipe:1",
    "-nostats",
    ...buildFfmpegArgs(inputPath, job.outputPath!, job.settings, durationLimitSeconds)
  ];
  const child = spawn("ffmpeg", args, { windowsHide: true });
  ctx.processes.set(job.id, child);

  job.status = "running";
  job.message = "Encoding started";

  child.stdout.on("data", (chunk) => {
    const text = String(chunk);
    const outTimeMs = text.match(/out_time_ms=(\d+)/);
    const sourceDuration = durationLimitSeconds ?? ctx.videoRepository.get(job.videoId)?.metadata.durationSeconds ?? 0;

    if (outTimeMs && sourceDuration > 0) {
      const elapsed = Number(outTimeMs[1]) / 1_000_000;
      job.progress = Math.min(99, Math.round((elapsed / sourceDuration) * 100));
      job.message = `Encoding ${job.progress}%`;
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text && job.status === "running") {
      job.message = text.split("\n").at(-1)?.slice(0, 220) || job.message;
    }
  });

  child.on("error", (error) => {
    job.status = "failed";
    job.message = error.message;
    job.completedAt = new Date().toISOString();
    ctx.processes.delete(job.id);
    void removeJobArtifacts(job);
    void saveManifest(ctx);
  });

  child.on("close", async (code) => {
    ctx.processes.delete(job.id);
    job.completedAt = new Date().toISOString();
    if (job.status === "canceled") {
      job.progress = 0;
      job.message = "Canceled";
      void saveManifest(ctx);
      return;
    }
    if (code !== 0) {
      job.status = "failed";
      job.message = `FFmpeg exited with code ${code}`;
      await removeJobArtifacts(job);
      void saveManifest(ctx);
      return;
    }

    job.status = "completed";
    job.progress = 100;
    job.message = "Encoding complete";
    job.outputSize = (await stat(job.outputPath!)).size;
    if (job.kind === "sample" && durationLimitSeconds) {
      const duration = ctx.videoRepository.get(job.videoId)?.metadata.durationSeconds ?? 0;
      const estimatedFullSize =
        duration > 0 ? Math.round((job.outputSize * duration) / durationLimitSeconds) : job.outputSize;
      const originalSize = ctx.videoRepository.get(job.videoId)?.metadata.fileSize;
      job.sampleEstimate = {
        sampleSeconds: durationLimitSeconds,
        estimatedFullSize,
        estimatedReduction: originalSize ? Math.round((1 - estimatedFullSize / originalSize) * 100) : undefined
      };
    }
    void saveManifest(ctx);
  });
}

export function createProductionRuntime(
  apiConfig: ApiConfig,
  dependencies: ProductionRuntimeDependencies = {}
): ApiRuntime {
  const ctx: RuntimeContext = {
    config: apiConfig,
    uploadDir: apiConfig.uploadDir,
    outputDir: apiConfig.outputDir,
    tmpDir: apiConfig.tmpDir,
    videoRepository: dependencies.videoRepository ?? new InMemoryVideoRepository(),
    jobRepository: dependencies.jobRepository ?? new InMemoryJobRepository(),
    manifestStore: dependencies.manifestStore ?? new FileManifestStore(apiConfig.manifestPath),
    processes: new Map()
  };

  return {
    async initialize() {
      ctx.videoRepository.clear();
      ctx.jobRepository.clear();
      ctx.processes.clear();
      await Promise.all([
        mkdir(ctx.uploadDir, { recursive: true }),
        mkdir(ctx.outputDir, { recursive: true }),
        mkdir(ctx.tmpDir, { recursive: true })
      ]);
      await loadManifest(ctx);
      await mergeDuplicateVideos(ctx);
      await pruneOrphanFiles(ctx);
      await saveManifest(ctx);
    },
    async getCapabilities() {
      return {
        ...(await ffmpegCapabilities()),
        ...(await speechCapabilities(ctx.config)),
        ...(await downloaderCapabilities(ctx.config))
      };
    },
    getHistory() {
      return historySnapshot(ctx);
    },
    async createVideoFromUpload(file: UploadedVideoFile) {
      if (!file.path) {
        throw new Error("Uploaded file path is required");
      }
      return toVideoRecordDto(await createVideoRecordFromFile(ctx, file.path, file.originalName));
    },
    async createVideoFromUrl(url: string) {
      return toVideoRecordDto(await downloadVideoFromUrl(ctx, url));
    },
    getVideo(id: string) {
      const video = ctx.videoRepository.get(id);
      return video ? toVideoRecordDto(video) : undefined;
    },
    getVideoMetadata(id: string) {
      return ctx.videoRepository.get(id)?.metadata;
    },
    getVideoSource(id: string) {
      const video = ctx.videoRepository.get(id);
      return video ? { filePath: video.storedPath, fileName: video.originalName } : undefined;
    },
    getVideoDownload(id: string) {
      const video = ctx.videoRepository.get(id);
      return video && fs.existsSync(video.storedPath)
        ? { filePath: video.storedPath, fileName: video.originalName }
        : undefined;
    },
    async renameVideo(id: string, originalName: string) {
      const video = ctx.videoRepository.get(id);
      if (!video) return undefined;
      const cleanBase = sanitizeFileName(path.parse(originalName).name);
      if (!cleanBase) throw new Error("Enter a filename with letters or numbers.");
      const currentExtension = path.extname(video.originalName) || path.extname(video.storedPath) || ".mp4";
      const requestedExtension = path.extname(originalName);
      const extension =
        requestedExtension && requestedExtension.toLowerCase() === currentExtension.toLowerCase()
          ? requestedExtension
          : currentExtension;
      video.originalName = `${cleanBase}${extension}`;
      video.metadata.fileName = video.originalName;
      await saveManifest(ctx);
      return toVideoRecordDto(video);
    },
    async deleteVideo(id: string) {
      const video = ctx.videoRepository.get(id);
      if (!video) return false;
      await removeVideoRecord(ctx, video);
      await pruneOrphanFiles(ctx);
      await saveManifest(ctx);
      return true;
    },
    createOptimizationJob(videoId: string, rawSettings: Partial<OptimizationSettings>) {
      const video = ctx.videoRepository.get(videoId);
      if (!video) return { status: 202 };
      const settings = normalizeOptimizationSettings(rawSettings ?? {});
      const existing = reusableJob(ctx, video, "encode", settings);
      if (existing) return { status: existing.status === "completed" ? 200 : 202, job: publicJob(existing) };
      const job = createEncodeJob(ctx, video, settings, "encode");
      runJob(ctx, job, video.storedPath);
      return { status: 202, job: publicJob(job) };
    },
    createSampleJob(videoId: string, rawSettings: Partial<OptimizationSettings>, rawSampleSeconds?: unknown) {
      const video = ctx.videoRepository.get(videoId);
      if (!video) return { status: 202 };
      const settings = normalizeOptimizationSettings({
        ...(rawSettings ?? {}),
        outputFilename: `${path.parse(video.originalName).name}-sample`
      });
      const sampleSeconds = Math.min(
        Math.max(Number(rawSampleSeconds ?? 5), 1),
        Math.max(1, video.metadata.durationSeconds || 5)
      );
      const existing = reusableJob(ctx, video, "sample", settings);
      if (existing) return { status: existing.status === "completed" ? 200 : 202, job: publicJob(existing) };
      const job = createEncodeJob(ctx, video, settings, "sample", "sample");
      runJob(ctx, job, video.storedPath, sampleSeconds);
      return { status: 202, job: publicJob(job) };
    },
    createPosterJob(videoId: string, rawAtSeconds?: unknown) {
      const video = ctx.videoRepository.get(videoId);
      if (!video) return undefined;
      const atSeconds = Math.min(
        Math.max(Number(rawAtSeconds ?? Math.min(1, video.metadata.durationSeconds / 2)), 0),
        Math.max(0, video.metadata.durationSeconds - 0.1)
      );
      const jobId = nanoid();
      const baseName = sanitizeFileName(`${path.parse(video.originalName).name}-poster`);
      const outputFileName = `${baseName}.webp`;
      const outputPath = path.join(ctx.outputDir, `${jobId}-${outputFileName}`);
      const settings = normalizeOptimizationSettings({ outputFilename: baseName });
      const job: Job = {
        id: jobId,
        videoId: video.id,
        status: "queued",
        kind: "poster",
        progress: 0,
        outputPath,
        outputFileName,
        ffmpegCommand: "",
        startedAt: new Date().toISOString(),
        settings
      };

      ctx.jobRepository.set(job);
      void saveManifest(ctx);
      runPosterJob(ctx, job, video.storedPath, atSeconds);
      return publicJob(job);
    },
    createSubtitleJob(videoId: string) {
      const video = ctx.videoRepository.get(videoId);
      if (!video) return { status: 404, error: "Video not found" };
      if (video.metadata.trackCounts.audio === 0) {
        return { status: 400, error: "No audio track found. Subtitles cannot be generated." };
      }
      const existing = ctx.jobRepository
        .getAll()
        .find(
          (job) =>
            job.videoId === video.id &&
            job.kind === "subtitle" &&
            (job.status === "queued" || job.status === "running" || job.status === "completed") &&
            (!job.outputPath || job.status !== "completed" || fs.existsSync(job.outputPath))
        );
      if (existing) return { status: existing.status === "completed" ? 200 : 202, job: publicJob(existing) };
      const job = createSubtitleJob(ctx, video);
      void runSubtitleJob(ctx, job, video.storedPath);
      return { status: 202, job: publicJob(job) };
    },
    createPairJobs(videoId: string) {
      const video = ctx.videoRepository.get(videoId);
      if (!video) return undefined;

      const base = path.parse(video.originalName).name;
      const fallback = normalizeOptimizationSettings({
        outputContainer: "mp4",
        videoCodec: "libx264",
        audioCodec: "aac",
        width: 1280,
        frameRate: 24,
        crf: 26,
        preset: "slow",
        audioMode: "compress",
        audioBitrateKbps: 128,
        audioSampleRate: 48000,
        audioChannels: 2,
        cpuUsed: 5,
        fastStart: true,
        stripMetadata: true,
        outputFilename: `${base}-fallback-h264`
      });
      const modern = normalizeOptimizationSettings({
        outputContainer: "webm",
        videoCodec: "libaom-av1",
        audioCodec: "libopus",
        width: 1280,
        frameRate: 24,
        crf: 36,
        preset: "slow",
        audioMode: "compress",
        cpuUsed: 5,
        rowMt: true,
        audioBitrateKbps: 96,
        audioSampleRate: 48000,
        audioChannels: 2,
        fastStart: false,
        stripMetadata: true,
        outputFilename: `${base}-modern-av1`
      });

      const existingFallback = reusableJob(ctx, video, "encode", fallback);
      const existingModern = reusableJob(ctx, video, "encode", modern);
      const fallbackJob = existingFallback ?? createEncodeJob(ctx, video, fallback, "encode", "fallback-h264");
      const modernJob = existingModern ?? createEncodeJob(ctx, video, modern, "encode", "modern-av1");
      if (!existingFallback) runJob(ctx, fallbackJob, video.storedPath);
      if (!existingModern) runJob(ctx, modernJob, video.storedPath);
      return { jobs: [publicJob(fallbackJob), publicJob(modernJob)] };
    },
    async createPackageJob(videoId: string, body: unknown) {
      return createPackageJob(ctx, videoId, body);
    },
    async deleteHistory(videoIds: string[], jobIds: string[]) {
      for (const jobId of jobIds) {
        const job = ctx.jobRepository.get(jobId);
        if (!job) continue;
        await removeJob(ctx, job);
      }

      for (const videoId of videoIds) {
        const video = ctx.videoRepository.get(videoId);
        if (!video) continue;
        await removeVideoRecord(ctx, video);
      }

      await pruneOrphanFiles(ctx);
      await saveManifest(ctx);
      return historySnapshot(ctx);
    },
    getJob(id: string) {
      const job = ctx.jobRepository.get(id);
      return job ? publicJob(job) : undefined;
    },
    async renameJob(id: string, outputFileName: string) {
      const job = ctx.jobRepository.get(id);
      if (!job || !job.outputFileName) return undefined;
      job.outputFileName = renamedOutputFileName(job.outputFileName, outputFileName);
      if (job.sidecarFileName && path.extname(job.outputFileName).toLowerCase() === ".vtt") {
        job.sidecarFileName = `${path.parse(job.outputFileName).name}.srt`;
      }
      await saveManifest(ctx);
      return publicJob(job);
    },
    async cancelJob(id: string) {
      const job = ctx.jobRepository.get(id);
      if (!job) return undefined;
      if (job.status !== "running" && job.status !== "queued") return publicJob(job);
      job.status = "canceled";
      job.message = "Canceled and removed";
      job.completedAt = new Date().toISOString();
      const responseJob = publicJob(job);
      await removeJob(ctx, job);
      await saveManifest(ctx);
      return responseJob;
    },
    getJobDownload(id: string) {
      const job = ctx.jobRepository.get(id);
      return job?.status === "completed" && job.outputPath && job.outputFileName
        ? { filePath: job.outputPath, fileName: job.outputFileName }
        : undefined;
    },
    getJobSidecar(id: string) {
      const job = ctx.jobRepository.get(id);
      return job?.status === "completed" && job.sidecarPath && job.sidecarFileName
        ? { filePath: job.sidecarPath, fileName: job.sidecarFileName }
        : undefined;
    },
    getJobOutput(id: string) {
      const job = ctx.jobRepository.get(id);
      return job?.status === "completed" && job.outputPath && job.outputFileName
        ? { filePath: job.outputPath, fileName: job.outputFileName }
        : undefined;
    },
    async getCaptions(id: string) {
      const job = ctx.jobRepository.get(id);
      if (!job || job.kind !== "subtitle" || job.status !== "completed" || !job.outputPath) return undefined;
      const vtt = await fs.promises.readFile(job.outputPath, "utf8");
      const srt =
        job.sidecarPath && fs.existsSync(job.sidecarPath)
          ? await fs.promises.readFile(job.sidecarPath, "utf8")
          : vttToSrt(vtt);
      return { vtt, srt };
    },
    async updateCaptions(id: string, rawVtt: string) {
      const job = ctx.jobRepository.get(id);
      if (!job || job.kind !== "subtitle" || job.status !== "completed" || !job.outputPath) return undefined;
      const vtt = rawVtt.trim();
      assertLooksLikeVtt(vtt);
      const finalVtt = /^WEBVTT\b/i.test(vtt) ? `${vtt}\n` : `WEBVTT\n\n${vtt}\n`;
      await fs.promises.writeFile(job.outputPath, finalVtt);
      if (job.sidecarPath) {
        await fs.promises.writeFile(job.sidecarPath, vttToSrt(finalVtt));
      }
      job.outputSize = (await stat(job.outputPath)).size;
      job.message = "Captions edited";
      await saveManifest(ctx);
      return publicJob(job);
    },
    createMuxSubtitleJob(videoJobId: string, subtitleJobId: string) {
      const videoJob = ctx.jobRepository.get(videoJobId);
      const subtitleJob = ctx.jobRepository.get(subtitleJobId);
      const video = videoJob ? ctx.videoRepository.get(videoJob.videoId) : undefined;
      if (
        !videoJob ||
        !video ||
        videoJob.status !== "completed" ||
        !videoJob.outputPath ||
        (videoJob.kind !== "encode" && videoJob.kind !== "mux")
      ) {
        return { status: 404, error: "Completed video output not found" };
      }
      if (
        !subtitleJob ||
        subtitleJob.videoId !== videoJob.videoId ||
        subtitleJob.kind !== "subtitle" ||
        subtitleJob.status !== "completed" ||
        !subtitleJob.outputPath
      ) {
        return { status: 400, error: "Completed subtitle output not found" };
      }

      const job = createMuxJob(ctx, video, videoJob, subtitleJob);
      runMuxJob(ctx, job, videoJob, subtitleJob);
      return { status: 202, job: publicJob(job) };
    },
    async revealJob(id: string) {
      const job = ctx.jobRepository.get(id);
      if (!job || job.status !== "completed" || !job.outputPath || !fs.existsSync(job.outputPath)) return false;
      await revealInFileManager(job.outputPath);
      return true;
    },
    async deleteJob(id: string) {
      const job = ctx.jobRepository.get(id);
      if (!job) return false;
      await removeJob(ctx, job);
      await pruneOrphanFiles(ctx);
      await saveManifest(ctx);
      return true;
    }
  };
}

async function createPackageJob(
  ctx: RuntimeContext,
  videoId: string,
  body: unknown
): Promise<{ status: 201 | 400 | 404; job?: JobDto; error?: string }> {
  const video = ctx.videoRepository.get(videoId);
  if (!video) {
    return { status: 404, error: "Video not found" };
  }

  const requestBody = (body ?? {}) as { jobIds?: unknown; metadata?: Record<string, unknown> };
  const requestedJobIds = Array.isArray(requestBody.jobIds) ? (requestBody.jobIds as string[]) : [];
  const packageMeta = requestBody.metadata ?? {};
  const packageTitle = String(packageMeta.title || path.parse(video.originalName).name).trim();
  const packageDescription = String(packageMeta.description || `Video for ${packageTitle}.`).trim();
  const packageLanguage = String(packageMeta.language || "en").trim() || "en";
  const filenamePrefix =
    sanitizeFileName(String(packageMeta.filenamePrefix || path.parse(video.originalName).name).trim()) ||
    sanitizeFileName(path.parse(video.originalName).name);
  const candidateJobs = ctx.jobRepository
    .getAll()
    .filter(
      (job) =>
        job.videoId === video.id &&
        job.status === "completed" &&
        job.outputPath &&
        (job.kind === "encode" || job.kind === "mux" || job.kind === "poster" || job.kind === "subtitle") &&
        (requestedJobIds.length === 0 || requestedJobIds.includes(job.id))
    );
  const encodeJobs = candidateJobs.filter((job) => job.kind === "encode" || job.kind === "mux");
  const posterJob = candidateJobs.find((job) => job.kind === "poster");
  const subtitleJob = candidateJobs.find((job) => job.kind === "subtitle");
  if (encodeJobs.length === 0) {
    return { status: 400, error: "Create at least one completed video export before packaging." };
  }

  const posterName = posterJob?.outputFileName ?? "poster.webp";
  const preferredContentJob = encodeJobs.find((job) => job.settings.outputContainer === "mp4") ?? encodeJobs[0];
  const sources = encodeJobs
    .map((job) => {
      const type = job.settings.outputContainer === "webm" ? "video/webm" : "video/mp4";
      return `    <source src="${escapeHtml(job.outputFileName!)}" type="${type}">`;
    })
    .join("\n");
  const hasSilent = encodeJobs.some((job) => job.settings.audioMode === "remove");
  const attrs = hasSilent ? 'autoplay muted loop playsinline preload="metadata"' : 'controls preload="metadata"';
  const captionText =
    subtitleJob?.outputPath && fs.existsSync(subtitleJob.outputPath)
      ? cleanCaptionText(await fs.promises.readFile(subtitleJob.outputPath, "utf8"))
      : "";
  const transcriptText = transcriptFromVtt(captionText);
  const transcriptName = subtitleJob?.outputFileName ? `${filenamePrefix}-transcript.txt` : "";
  const track = subtitleJob?.outputFileName
    ? `    <track src="${escapeHtml(subtitleJob.outputFileName)}" kind="subtitles" srclang="${escapeHtml(packageLanguage)}" label="Captions" default>`
    : "";
  const schema = compactJsonObject({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: packageTitle,
    description: packageDescription,
    thumbnailUrl: posterName,
    uploadDate: video.uploadedAt,
    duration: isoDuration(video.metadata.durationSeconds),
    contentUrl: preferredContentJob?.outputFileName
  });
  const previewSnippet = `<figure class="web-video-embed">
  <video ${attrs} poster="${escapeHtml(posterName)}" aria-label="${escapeHtml(packageTitle)}">
${sources}
  </video>
  ${
    transcriptText
      ? `<figcaption>
    <details>
      <summary>Transcript for ${escapeHtml(packageTitle)}</summary>
      <p>${escapeHtml(transcriptText).replace(/\n/g, "<br>")}</p>
    </details>
  </figcaption>`
      : ""
  }
</figure>`;
  const productionSnippet = `<figure class="web-video-embed">
  <video ${attrs} poster="${escapeHtml(posterName)}" aria-label="${escapeHtml(packageTitle)}">
${sources}${track ? `\n${track}` : ""}
  </video>
  ${
    transcriptText
      ? `<figcaption>
    <details>
      <summary>Transcript for ${escapeHtml(packageTitle)}</summary>
      <p>${escapeHtml(transcriptText).replace(/\n/g, "<br>")}</p>
    </details>
  </figcaption>`
      : ""
  }
</figure>
<script type="application/ld+json">${jsonForHtml(schema)}</script>`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(packageTitle)} - Web Video Embed</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; gap: 18px; padding: 24px; font-family: system-ui, sans-serif; color: #f7f7f7; background: #111; box-sizing: border-box; }
    main { width: min(1080px, 100%); display: grid; gap: 14px; }
    .web-video-embed { display: grid; gap: 10px; margin: 0; }
    video { width: 100%; aspect-ratio: ${video.metadata.width && video.metadata.height ? `${video.metadata.width} / ${video.metadata.height}` : "16 / 9"}; background: #000; border-radius: 10px; }
    video::cue { color: #fff; background: rgba(0, 0, 0, 0.72); font-size: 1.05rem; line-height: 1.35; }
    details { color: #d8d8d8; }
    summary { cursor: pointer; font-weight: 700; }
    p, pre { margin: 0; color: #c9c9c9; }
    pre { overflow: auto; padding: 14px; border: 1px solid #333; border-radius: 8px; background: #181818; font-size: 0.85rem; }
    .snippet-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .snippet-toolbar strong { color: #f7f7f7; }
    button { padding: 8px 11px; border: 1px solid #444; border-radius: 7px; color: #f7f7f7; background: #222; cursor: pointer; }
    button:hover { background: #2e2e2e; }
  </style>
  <script type="application/ld+json">${jsonForHtml(schema)}</script>
</head>
<body>
  <main>
    ${previewSnippet}
    ${subtitleJob?.outputFileName ? `<p>Captions are included as <code>${escapeHtml(subtitleJob.outputFileName)}</code>. This preview forces the default subtitle track on; on a production site users can toggle captions in the video controls.</p>` : "<p>No captions were selected for this package.</p>"}
    <div class="snippet-toolbar">
      <strong>Production Embed</strong>
      <button type="button" id="copy-embed" aria-describedby="copy-status">Copy</button>
    </div>
    <pre id="embed-code">${escapeHtml(productionSnippet)}</pre>
    <p id="copy-status" aria-live="polite"></p>
  </main>
  <script>
    const video = document.querySelector("video");
    const inlineVtt = ${jsonForHtml(captionText)};
    const embedCode = ${jsonForHtml(productionSnippet)};
    const copyButton = document.querySelector("#copy-embed");
    const copyStatus = document.querySelector("#copy-status");

    function showCaptions() {
      if (!video) return;
      for (const track of video.textTracks) track.mode = "showing";
    }

    function useInlineCaptions() {
      if (!video || !inlineVtt) return;
      const inlineTrack = document.createElement("track");
      inlineTrack.kind = "subtitles";
      inlineTrack.srclang = ${jsonForHtml(packageLanguage)};
      inlineTrack.label = "Captions";
      inlineTrack.default = true;
      inlineTrack.src = URL.createObjectURL(new Blob([inlineVtt], { type: "text/vtt" }));
      video.appendChild(inlineTrack);
      inlineTrack.addEventListener("load", showCaptions);
      window.setTimeout(showCaptions, 250);
    }

    useInlineCaptions();
    video?.addEventListener("loadedmetadata", showCaptions);
    window.setTimeout(showCaptions, 250);

    copyButton?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(embedCode);
        copyStatus.textContent = "Copied embed code.";
        copyButton.textContent = "Copied";
        window.setTimeout(() => {
          copyButton.textContent = "Copy";
          copyStatus.textContent = "";
        }, 1800);
      } catch {
        copyStatus.textContent = "Copy failed. Select the code block and copy it manually.";
      }
    });
  </script>
</body>
</html>
`;
  const readme = [
    "Web Video Package",
    "=================",
    "",
    `Source: ${video.originalName}`,
    `Title: ${packageTitle}`,
    `Description: ${packageDescription}`,
    `Language: ${packageLanguage}`,
    `Created: ${new Date().toISOString()}`,
    "",
    "Files:",
    ...encodeJobs.map(
      (job) => `- ${job.outputFileName} (${job.settings.outputContainer.toUpperCase()} / ${job.settings.videoCodec})`
    ),
    posterJob
      ? `- ${posterName} (poster image)`
      : "- poster.webp (placeholder referenced in embed.html; generate one in the app)",
    subtitleJob?.outputFileName
      ? `- ${subtitleJob.outputFileName} (WebVTT captions)`
      : "- captions.vtt (optional; generate subtitles in the app)",
    subtitleJob?.sidecarFileName ? `- ${subtitleJob.sidecarFileName} (SRT captions)` : "",
    transcriptName ? `- ${transcriptName} (plain-text transcript)` : "",
    "- embed.html",
    "",
    'Use preload="metadata" for most website videos and keep silent hero videos muted + playsinline.',
    "",
    "Accessibility and SEO:",
    "- embed.html includes captions, a transcript disclosure, fixed video aspect-ratio styling, and VideoObject JSON-LD.",
    "- Replace the generated VideoObject description with page-specific copy before publishing.",
    "",
    "Caption note:",
    "The embed.html preview forces the default caption track on and includes an inline WebVTT fallback for local file testing. On a real website, keep the .vtt file next to the video or update the <track src> path."
  ].join("\n");

  const entries = [
    ...(await Promise.all(
      encodeJobs.map(async (job) => ({
        name: job.outputFileName!,
        data: await fs.promises.readFile(job.outputPath!)
      }))
    )),
    ...(posterJob?.outputPath ? [{ name: posterName, data: await fs.promises.readFile(posterJob.outputPath) }] : []),
    ...(subtitleJob?.outputPath && subtitleJob.outputFileName
      ? [{ name: subtitleJob.outputFileName, data: await fs.promises.readFile(subtitleJob.outputPath) }]
      : []),
    ...(subtitleJob?.sidecarPath && subtitleJob.sidecarFileName && fs.existsSync(subtitleJob.sidecarPath)
      ? [{ name: subtitleJob.sidecarFileName, data: await fs.promises.readFile(subtitleJob.sidecarPath) }]
      : []),
    ...(transcriptName && transcriptText ? [{ name: transcriptName, data: Buffer.from(transcriptText) }] : []),
    { name: "embed.html", data: Buffer.from(html) },
    { name: "README.txt", data: Buffer.from(readme) }
  ];

  const zip = createZip(entries);
  const packageId = nanoid();
  const outputFileName = `${filenamePrefix}-web-package.zip`;
  const outputPath = path.join(ctx.outputDir, `${packageId}-${outputFileName}`);
  await fs.promises.writeFile(outputPath, zip);

  const job = createEncodeJob(
    ctx,
    video,
    normalizeOptimizationSettings({ outputFilename: path.parse(outputFileName).name }),
    "package",
    "web-package"
  );
  job.status = "completed";
  job.progress = 100;
  job.message = "Web package created";
  job.completedAt = new Date().toISOString();
  job.outputFileName = outputFileName;
  job.outputPath = outputPath;
  job.outputSize = zip.length;
  job.ffmpegCommand = "Generated package from completed outputs";
  await saveManifest(ctx);

  return { status: 201, job: publicJob(job) };
}
