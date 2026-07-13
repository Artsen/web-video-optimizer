import cors from "cors";
import express from "express";
import fs from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import multer from "multer";
import { nanoid } from "nanoid";
import type { JobDto, JobKind, OptimizationSettings, VideoRecordDto } from "@local-video-optimizer/contracts";
import {
  analyzeWebFriendliness,
  assertLooksLikeVtt,
  buildFfmpegArgs,
  defaultSettings,
  parseByteRange,
  parseNumber,
  parseRate,
  sanitizeFileName,
  shiftCaptionTimings,
  vttToSrt
} from "./video-domain.js";
import type { FFprobeResult, FFprobeStream, VideoMetadata } from "./video-domain.js";

const mkdir = promisify(fs.mkdir);
const rm = promisify(fs.rm);
const stat = promisify(fs.stat);

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const storageRoot = process.env.STORAGE_ROOT ?? path.resolve(process.cwd(), "../../data");
const uploadDir = path.join(storageRoot, "uploads");
const outputDir = path.join(storageRoot, "outputs");
const tmpDir = path.join(storageRoot, "tmp");
const manifestPath = path.join(storageRoot, "manifest.json");

type VideoRecord = VideoRecordDto & {
  storedPath: string;
  sourceHash?: string;
};

type Job = JobDto & {
  outputPath?: string;
  sidecarPath?: string;
};

type Manifest = {
  videos: VideoRecord[];
  jobs: Job[];
};

const videos = new Map<string, VideoRecord>();
const jobs = new Map<string, Job>();
const processes = new Map<string, ReturnType<typeof spawn>>();

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

async function removeJob(job: Job): Promise<void> {
  processes.get(job.id)?.kill("SIGTERM");
  processes.delete(job.id);
  await removeJobArtifacts(job);
  jobs.delete(job.id);
}

async function removeVideoRecord(video: VideoRecord): Promise<void> {
  await rm(video.storedPath, { force: true, maxRetries: 5, retryDelay: 150 });
  for (const job of Array.from(jobs.values())) {
    if (job.videoId === video.id) {
      await removeJob(job);
    }
  }
  videos.delete(video.id);
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

async function pruneOrphanFiles(): Promise<void> {
  const uploadKeep = new Set(Array.from(videos.values()).map((video) => path.resolve(video.storedPath)));
  const outputKeep = new Set<string>();
  for (const job of jobs.values()) {
    if (job.outputPath) outputKeep.add(path.resolve(job.outputPath));
    if (job.sidecarPath) outputKeep.add(path.resolve(job.sidecarPath));
  }
  await Promise.all([
    pruneDirectory(uploadDir, uploadKeep),
    pruneDirectory(outputDir, outputKeep),
    pruneDirectory(tmpDir, new Set())
  ]);
}

async function createVideoRecordFromFile(
  filePath: string,
  originalName: string,
  uploadedAt = new Date().toISOString()
): Promise<VideoRecord> {
  const sourceHash = await fileHash(filePath);
  const existing = Array.from(videos.values()).find((video) => video.sourceHash === sourceHash);
  if (existing) {
    await rm(filePath, { force: true, maxRetries: 5, retryDelay: 150 });
    return existing;
  }

  const id = nanoid();
  const extension = path.extname(originalName) || path.extname(filePath) || ".mp4";
  const storedPath = path.join(uploadDir, `${id}${extension}`);
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
  videos.set(id, record);
  await saveManifest();
  return record;
}

async function downloadVideoFromUrl(url: string): Promise<VideoRecord> {
  const ytDlpCommand = await resolveYtDlpCommand();
  if (!ytDlpCommand) {
    throw new Error("yt-dlp was not found. Install yt-dlp or set YT_DLP_BIN to enable URL imports.");
  }

  const importId = nanoid();
  const downloadDir = path.join(tmpDir, `url-import-${importId}`);
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
          ...ytDlpJsRuntimeArgs(),
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

  const importPath = path.join(tmpDir, `${importId}-${path.basename(videoFile)}`);
  await fs.promises.rename(videoFile, importPath);
  await rm(downloadDir, { recursive: true, force: true });
  return createVideoRecordFromFile(importPath, path.basename(importPath));
}

async function mergeDuplicateVideos(): Promise<void> {
  const byHash = new Map<string, VideoRecord>();
  for (const video of Array.from(videos.values()).sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))) {
    if (!video.sourceHash) continue;
    const keeper = byHash.get(video.sourceHash);
    if (!keeper) {
      byHash.set(video.sourceHash, video);
      continue;
    }

    for (const job of jobs.values()) {
      if (job.videoId === video.id) {
        job.videoId = keeper.id;
      }
    }
    await rm(video.storedPath, { force: true, maxRetries: 5, retryDelay: 150 });
    videos.delete(video.id);
  }
}

async function saveManifest(): Promise<void> {
  const manifest: Manifest = {
    videos: Array.from(videos.values()),
    jobs: Array.from(jobs.values())
      .filter((job) => job.status !== "canceled")
      .map((job) => ({
        ...job,
        status: job.status === "running" || job.status === "queued" ? "canceled" : job.status,
        message: job.status === "running" || job.status === "queued" ? "Canceled by API restart" : job.message
      }))
  };

  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

async function loadManifest(): Promise<void> {
  try {
    const raw = await fs.promises.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as Manifest;

    for (const video of manifest.videos ?? []) {
      if (fs.existsSync(video.storedPath)) {
        videos.set(video.id, {
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
        jobs.set(restored.id, restored);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Unable to load manifest:", error);
    }
  }
}

function findRotation(stream?: FFprobeStream): string | undefined {
  const rotateTag = stream?.tags?.rotate;
  if (rotateTag) return `${rotateTag}deg`;

  const sideData = stream?.side_data_list?.find((item) => "rotation" in item);
  const rotation = sideData?.rotation;
  return typeof rotation === "number" ? `${rotation}deg` : undefined;
}

function normalizeProbe(fileName: string, probe: FFprobeResult): VideoMetadata {
  const streams = probe.streams ?? [];
  const videoStreams = streams.filter((stream) => stream.codec_type === "video");
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  const subtitleStreams = streams.filter((stream) => stream.codec_type === "subtitle");
  const primaryVideo = videoStreams[0];
  const primaryAudio = audioStreams[0];

  const base = {
    fileName,
    fileSize: parseNumber(probe.format?.size) ?? 0,
    durationSeconds: parseNumber(probe.format?.duration) ?? 0,
    container: probe.format?.format_name ?? "unknown",
    formatLongName: probe.format?.format_long_name,
    videoCodec: primaryVideo?.codec_name,
    audioCodec: primaryAudio?.codec_name,
    trackCounts: {
      video: videoStreams.length,
      audio: audioStreams.length,
      subtitle: subtitleStreams.length
    },
    width: primaryVideo?.width,
    height: primaryVideo?.height,
    displayAspectRatio: primaryVideo?.display_aspect_ratio,
    frameRate: parseRate(primaryVideo?.avg_frame_rate ?? primaryVideo?.r_frame_rate),
    overallBitrate: parseNumber(probe.format?.bit_rate),
    videoBitrate: parseNumber(primaryVideo?.bit_rate),
    audioBitrate: parseNumber(primaryAudio?.bit_rate),
    audioSampleRate: parseNumber(primaryAudio?.sample_rate),
    audioChannels: primaryAudio?.channels,
    pixelFormat: primaryVideo?.pix_fmt,
    color: {
      space: primaryVideo?.color_space,
      transfer: primaryVideo?.color_transfer,
      primaries: primaryVideo?.color_primaries
    },
    rotation: findRotation(primaryVideo),
    tags: probe.format?.tags
  };

  return {
    ...base,
    ...analyzeWebFriendliness(base)
  };
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

async function ffmpegCapabilities(): Promise<Record<string, boolean>> {
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

async function speechCapabilities(): Promise<{
  whisperCpp: boolean;
  whisperModel: boolean;
  whisperCommand?: string;
  whisperModelPath?: string;
}> {
  const configuredModel = process.env.WHISPER_CPP_MODEL;
  const whisperCommand = await resolveWhisperCommand();

  return {
    whisperCpp: Boolean(whisperCommand),
    whisperModel: Boolean(configuredModel && fs.existsSync(configuredModel)),
    whisperCommand,
    whisperModelPath: configuredModel
  };
}

async function downloaderCapabilities(): Promise<{ ytDlp: boolean; ytDlpCommand?: string; ytDlpJsRuntime?: string }> {
  const ytDlpCommand = await resolveYtDlpCommand();
  return {
    ytDlp: Boolean(ytDlpCommand),
    ytDlpCommand,
    ytDlpJsRuntime: ytDlpJsRuntimeValue()
  };
}

async function resolveWhisperCommand(): Promise<string | undefined> {
  const configuredCommand = process.env.WHISPER_CPP_BIN;
  const candidates = configuredCommand ? [configuredCommand] : ["whisper-cli", "main", "whisper-cpp"];
  for (const candidate of candidates) {
    if (await commandExists(candidate)) return candidate;
  }
  return undefined;
}

async function resolveYtDlpCommand(): Promise<string | undefined> {
  const configuredCommand = process.env.YT_DLP_BIN;
  const candidates = configuredCommand ? [stripWrappingQuotes(configuredCommand)] : ["yt-dlp", "yt-dlp.exe"];
  for (const candidate of candidates) {
    if (await commandExists(candidate, ["--version"])) return candidate;
  }
  return undefined;
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^"|"$/g, "");
}

function ytDlpJsRuntimeValue(): string {
  const configuredRuntime = process.env.YT_DLP_JS_RUNTIME?.trim();
  if (configuredRuntime) return stripWrappingQuotes(configuredRuntime);
  return `node:${process.execPath}`;
}

function ytDlpJsRuntimeArgs(): string[] {
  return ["--js-runtimes", ytDlpJsRuntimeValue()];
}

function publicJob(job: Job): JobDto {
  return { ...job };
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

function historySnapshot() {
  return {
    videos: Array.from(videos.values()).map((video) => ({
      id: video.id,
      originalName: video.originalName,
      uploadedAt: video.uploadedAt,
      metadata: video.metadata,
      jobIds: Array.from(jobs.values())
        .filter((job) => job.videoId === video.id)
        .map((job) => job.id)
    })),
    jobs: Array.from(jobs.values())
      .map(publicJob)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  };
}

function commandPreview(args: string[]): string {
  return ["ffmpeg", ...args].map((part) => (part.includes(" ") ? `"${part}"` : part)).join(" ");
}

function contentTypeFor(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".mp4" || extension === ".m4v") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".mkv") return "video/x-matroska";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".png") return "image/png";
  if (extension === ".vtt") return "text/vtt";
  if (extension === ".srt") return "application/x-subrip";
  if (extension === ".zip") return "application/zip";
  return "application/octet-stream";
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

async function streamVideoFile(
  req: express.Request,
  res: express.Response,
  filePath: string,
  fileName: string,
  disposition: "inline" | "attachment"
): Promise<void> {
  const fileStat = await stat(filePath);
  const range = req.headers.range;
  const safeName = sanitizeFileName(fileName);

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentTypeFor(fileName));
  res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);

  if (!range) {
    res.setHeader("Content-Length", fileStat.size);
    createReadStream(filePath).pipe(res);
    return;
  }

  const parsedRange = parseByteRange(range, fileStat.size);
  if (!parsedRange) {
    res.status(416).setHeader("Content-Range", `bytes */${fileStat.size}`);
    res.end();
    return;
  }

  const { start, end } = parsedRange;
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${fileStat.size}`);
  res.setHeader("Content-Length", end - start + 1);
  createReadStream(filePath, { start, end }).pipe(res);
}

function createEncodeJob(video: VideoRecord, settings: OptimizationSettings, kind: JobKind, suffix = "optimized"): Job {
  const jobId = nanoid();
  const baseName = sanitizeFileName(settings.outputFilename || `${path.parse(video.originalName).name}-${suffix}`);
  const extension = settings.outputContainer === "webm" ? ".webm" : ".mp4";
  const outputFileName = `${baseName}${extension}`;
  const outputPath = path.join(outputDir, `${jobId}-${outputFileName}`);
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

  jobs.set(jobId, job);
  void saveManifest();
  return job;
}

function matchingSettings(a: OptimizationSettings, b: OptimizationSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function reusableJob(video: VideoRecord, kind: Job["kind"], settings: OptimizationSettings): Job | undefined {
  return Array.from(jobs.values()).find(
    (job) =>
      job.videoId === video.id &&
      job.kind === kind &&
      (job.status === "queued" || job.status === "running" || job.status === "completed") &&
      matchingSettings(job.settings, settings) &&
      (!job.outputPath || job.status !== "completed" || fs.existsSync(job.outputPath))
  );
}

function createSubtitleJob(video: VideoRecord): Job {
  const jobId = nanoid();
  const baseName = sanitizeFileName(`${path.parse(video.originalName).name}-captions`);
  const outputFileName = `${baseName}.vtt`;
  const sidecarFileName = `${baseName}.srt`;
  const outputBasePath = path.join(outputDir, `${jobId}-${baseName}`);
  const outputPath = `${outputBasePath}.vtt`;
  const sidecarPath = `${outputBasePath}.srt`;
  const settings = defaultSettings({ outputFilename: baseName });
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

  jobs.set(jobId, job);
  void saveManifest();
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

function createMuxJob(video: VideoRecord, videoJob: Job, subtitleJob: Job): Job {
  const jobId = nanoid();
  const parsed = path.parse(videoJob.outputFileName ?? video.originalName);
  const extension = parsed.ext || (videoJob.settings.outputContainer === "webm" ? ".webm" : ".mp4");
  const baseName = sanitizeFileName(`${parsed.name || path.parse(video.originalName).name}-captioned`);
  const outputFileName = `${baseName}${extension}`;
  const outputPath = path.join(outputDir, `${jobId}-${outputFileName}`);
  const settings = defaultSettings({ ...videoJob.settings, outputFilename: baseName });
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

  jobs.set(jobId, job);
  void saveManifest();
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

function runMuxJob(job: Job, videoJob: Job, subtitleJob: Job): void {
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
  processes.set(job.id, child);
  job.status = "running";
  job.message = "Embedding subtitle track";

  child.stdout.on("data", (chunk) => {
    const text = String(chunk);
    const outTimeMs = text.match(/out_time_ms=(\d+)/);
    const sourceDuration = videos.get(job.videoId)?.metadata.durationSeconds ?? 0;
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
    processes.delete(job.id);
    void removeJobArtifacts(job);
    void saveManifest();
  });

  child.on("close", async (code) => {
    processes.delete(job.id);
    job.completedAt = new Date().toISOString();
    if (job.status === "canceled") {
      job.progress = 0;
      job.message = "Canceled";
      void saveManifest();
      return;
    }
    if (code !== 0) {
      job.status = "failed";
      job.message = `FFmpeg exited with code ${code}`;
      await removeJobArtifacts(job);
      void saveManifest();
      return;
    }

    job.status = "completed";
    job.progress = 100;
    job.message = "Captions embedded";
    job.outputSize = (await stat(job.outputPath!)).size;
    void saveManifest();
  });
}

async function runSubtitleJob(job: Job, inputPath: string): Promise<void> {
  const whisperCommand = await resolveWhisperCommand();
  const whisperModel = process.env.WHISPER_CPP_MODEL;
  const audioPath = path.join(tmpDir, `${job.id}-subtitle.wav`);
  const outputBasePath = job.outputPath!.replace(/\.vtt$/i, "");

  job.status = "running";
  job.progress = 3;
  job.message = "Checking leading silence";

  if (!whisperCommand) {
    job.status = "failed";
    job.message = "whisper.cpp executable was not found. Set WHISPER_CPP_BIN or add whisper-cli to PATH.";
    job.completedAt = new Date().toISOString();
    void removeJobArtifacts(job);
    void saveManifest();
    return;
  }

  if (!whisperModel) {
    job.status = "failed";
    job.message = "WHISPER_CPP_MODEL is not configured";
    job.completedAt = new Date().toISOString();
    void removeJobArtifacts(job);
    void saveManifest();
    return;
  }

  const leadingSilenceSeconds = await detectLeadingSilence(inputPath);
  if (jobs.get(job.id)?.status === "canceled") {
    job.progress = 0;
    job.message = "Canceled";
    job.completedAt = new Date().toISOString();
    void saveManifest();
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
  void saveManifest();

  const extractor = spawn("ffmpeg", extractArgs, { windowsHide: true });
  processes.set(job.id, extractor);

  extractor.on("error", (error) => {
    job.status = "failed";
    job.message = error.message;
    job.completedAt = new Date().toISOString();
    processes.delete(job.id);
    void removeJobArtifacts(job);
    void saveManifest();
  });

  extractor.on("close", (code) => {
    if (job.status === "canceled") {
      processes.delete(job.id);
      void fs.promises.rm(audioPath, { force: true });
      void saveManifest();
      return;
    }
    if (code !== 0) {
      job.status = "failed";
      job.message = `Audio extraction exited with code ${code}`;
      job.completedAt = new Date().toISOString();
      processes.delete(job.id);
      void removeJobArtifacts(job);
      void saveManifest();
      return;
    }

    job.progress = 35;
    job.message = "Transcribing speech with whisper.cpp";
    const whisper = spawn(whisperCommand, whisperArgs, { windowsHide: true });
    processes.set(job.id, whisper);

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
      processes.delete(job.id);
      void fs.promises.rm(audioPath, { force: true });
      void removeJobArtifacts(job);
      void saveManifest();
    });

    whisper.on("close", async (whisperCode) => {
      processes.delete(job.id);
      await fs.promises.rm(audioPath, { force: true });
      job.completedAt = new Date().toISOString();
      if (job.status === "canceled") {
        job.progress = 0;
        job.message = "Canceled";
        void saveManifest();
        return;
      }
      if (whisperCode !== 0) {
        job.status = "failed";
        job.message = `whisper.cpp exited with code ${whisperCode}`;
        await removeJobArtifacts(job);
        void saveManifest();
        return;
      }
      if (!fs.existsSync(job.outputPath!)) {
        job.status = "failed";
        job.message = "whisper.cpp did not create a VTT file";
        await removeJobArtifacts(job);
        void saveManifest();
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
      void saveManifest();
    });
  });
}

function runPosterJob(job: Job, inputPath: string, atSeconds: number): void {
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
  processes.set(job.id, child);
  job.status = "running";
  job.message = "Generating poster";
  job.ffmpegCommand = commandPreview(args);

  child.on("error", (error) => {
    job.status = "failed";
    job.message = error.message;
    job.completedAt = new Date().toISOString();
    processes.delete(job.id);
    void removeJobArtifacts(job);
    void saveManifest();
  });

  child.on("close", async (code) => {
    processes.delete(job.id);
    job.completedAt = new Date().toISOString();
    if (job.status === "canceled") {
      job.message = "Canceled";
      void saveManifest();
      return;
    }
    if (code !== 0) {
      job.status = "failed";
      job.message = `FFmpeg exited with code ${code}`;
      await removeJobArtifacts(job);
      void saveManifest();
      return;
    }
    job.status = "completed";
    job.progress = 100;
    job.message = "Poster generated";
    job.outputSize = (await stat(job.outputPath!)).size;
    void saveManifest();
  });
}

function runJob(job: Job, inputPath: string, durationLimitSeconds?: number): void {
  const args = [
    "-progress",
    "pipe:1",
    "-nostats",
    ...buildFfmpegArgs(inputPath, job.outputPath!, job.settings, durationLimitSeconds)
  ];
  const child = spawn("ffmpeg", args, { windowsHide: true });
  processes.set(job.id, child);

  job.status = "running";
  job.message = "Encoding started";

  child.stdout.on("data", (chunk) => {
    const text = String(chunk);
    const outTimeMs = text.match(/out_time_ms=(\d+)/);
    const sourceDuration = durationLimitSeconds ?? videos.get(job.videoId)?.metadata.durationSeconds ?? 0;

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
    processes.delete(job.id);
    void removeJobArtifacts(job);
    void saveManifest();
  });

  child.on("close", async (code) => {
    processes.delete(job.id);
    job.completedAt = new Date().toISOString();
    if (job.status === "canceled") {
      job.progress = 0;
      job.message = "Canceled";
      void saveManifest();
      return;
    }
    if (code !== 0) {
      job.status = "failed";
      job.message = `FFmpeg exited with code ${code}`;
      await removeJobArtifacts(job);
      void saveManifest();
      return;
    }

    job.status = "completed";
    job.progress = 100;
    job.message = "Encoding complete";
    job.outputSize = (await stat(job.outputPath!)).size;
    if (job.kind === "sample" && durationLimitSeconds) {
      const duration = videos.get(job.videoId)?.metadata.durationSeconds ?? 0;
      const estimatedFullSize =
        duration > 0 ? Math.round((job.outputSize * duration) / durationLimitSeconds) : job.outputSize;
      const originalSize = videos.get(job.videoId)?.metadata.fileSize;
      job.sampleEstimate = {
        sampleSeconds: durationLimitSeconds,
        estimatedFullSize,
        estimatedReduction: originalSize ? Math.round((1 - estimatedFullSize / originalSize) * 100) : undefined
      };
    }
    void saveManifest();
  });
}

async function bootstrap(): Promise<void> {
  await Promise.all([
    mkdir(uploadDir, { recursive: true }),
    mkdir(outputDir, { recursive: true }),
    mkdir(tmpDir, { recursive: true })
  ]);
  await loadManifest();
  await mergeDuplicateVideos();
  await pruneOrphanFiles();
  await saveManifest();

  const upload = multer({
    dest: uploadDir,
    limits: {
      fileSize: 2 * 1024 * 1024 * 1024
    }
  });

  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }));
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/capabilities", async (_req, res) => {
    res.json({ ...(await ffmpegCapabilities()), ...(await speechCapabilities()), ...(await downloaderCapabilities()) });
  });

  app.get("/api/history", (_req, res) => {
    res.json(historySnapshot());
  });

  app.post("/api/videos", upload.single("video"), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Missing video file" });
        return;
      }

      const record = await createVideoRecordFromFile(req.file.path, req.file.originalname);
      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/videos/url", async (req, res, next) => {
    try {
      const url = String(req.body?.url ?? "").trim();
      if (!/^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(url)) {
        res.status(400).json({ error: "Enter a valid YouTube URL." });
        return;
      }

      const record = await downloadVideoFromUrl(url);
      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/videos/:id/source", async (req, res, next) => {
    const video = videos.get(req.params.id);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    try {
      await streamVideoFile(req, res, video.storedPath, video.originalName, "inline");
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/videos/:id/download", (req, res) => {
    const video = videos.get(req.params.id);
    if (!video || !fs.existsSync(video.storedPath)) {
      res.status(404).json({ error: "Source video not found" });
      return;
    }

    res.download(video.storedPath, video.originalName);
  });

  app.patch("/api/videos/:id", async (req, res, next) => {
    try {
      const video = videos.get(req.params.id);
      if (!video) {
        res.status(404).json({ error: "Video not found" });
        return;
      }

      const nextName = String(req.body?.originalName ?? "").trim();
      if (!nextName) {
        res.status(400).json({ error: "Enter a source filename." });
        return;
      }

      const cleanBase = sanitizeFileName(path.parse(nextName).name);
      if (!cleanBase) {
        res.status(400).json({ error: "Enter a filename with letters or numbers." });
        return;
      }

      const currentExtension = path.extname(video.originalName) || path.extname(video.storedPath) || ".mp4";
      const requestedExtension = path.extname(nextName);
      const extension =
        requestedExtension && requestedExtension.toLowerCase() === currentExtension.toLowerCase()
          ? requestedExtension
          : currentExtension;
      video.originalName = `${cleanBase}${extension}`;
      video.metadata.fileName = video.originalName;
      await saveManifest();
      res.json(video);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/videos/:id/jobs", (req, res) => {
    const video = videos.get(req.params.id);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const settings = defaultSettings(req.body ?? {});
    const existing = reusableJob(video, "encode", settings);
    if (existing) {
      res.status(existing.status === "completed" ? 200 : 202).json(publicJob(existing));
      return;
    }
    const job = createEncodeJob(video, settings, "encode");
    res.status(202).json(publicJob(job));
    runJob(job, video.storedPath);
  });

  app.post("/api/videos/:id/sample", (req, res) => {
    const video = videos.get(req.params.id);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const settings = defaultSettings({
      ...(req.body ?? {}),
      outputFilename: `${path.parse(video.originalName).name}-sample`
    });
    const sampleSeconds = Math.min(
      Math.max(Number(req.body?.sampleSeconds ?? 5), 1),
      Math.max(1, video.metadata.durationSeconds || 5)
    );
    const existing = reusableJob(video, "sample", settings);
    if (existing) {
      res.status(existing.status === "completed" ? 200 : 202).json(publicJob(existing));
      return;
    }
    const job = createEncodeJob(video, settings, "sample", "sample");
    res.status(202).json(publicJob(job));
    runJob(job, video.storedPath, sampleSeconds);
  });

  app.post("/api/videos/:id/poster", (req, res) => {
    const video = videos.get(req.params.id);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const atSeconds = Math.min(
      Math.max(Number(req.body?.atSeconds ?? Math.min(1, video.metadata.durationSeconds / 2)), 0),
      Math.max(0, video.metadata.durationSeconds - 0.1)
    );
    const jobId = nanoid();
    const baseName = sanitizeFileName(`${path.parse(video.originalName).name}-poster`);
    const outputFileName = `${baseName}.webp`;
    const outputPath = path.join(outputDir, `${jobId}-${outputFileName}`);
    const settings = defaultSettings({ outputFilename: baseName });
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

    jobs.set(jobId, job);
    void saveManifest();
    res.status(202).json(publicJob(job));
    runPosterJob(job, video.storedPath, atSeconds);
  });

  app.post("/api/videos/:id/subtitles", (req, res) => {
    const video = videos.get(req.params.id);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    if (video.metadata.trackCounts.audio === 0) {
      res.status(400).json({ error: "No audio track found. Subtitles cannot be generated." });
      return;
    }
    const existing = Array.from(jobs.values()).find(
      (job) =>
        job.videoId === video.id &&
        job.kind === "subtitle" &&
        (job.status === "queued" || job.status === "running" || job.status === "completed") &&
        (!job.outputPath || job.status !== "completed" || fs.existsSync(job.outputPath))
    );
    if (existing) {
      res.status(existing.status === "completed" ? 200 : 202).json(publicJob(existing));
      return;
    }

    const job = createSubtitleJob(video);
    res.status(202).json(publicJob(job));
    void runSubtitleJob(job, video.storedPath);
  });

  app.post("/api/videos/:id/pair", (req, res) => {
    const video = videos.get(req.params.id);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const base = path.parse(video.originalName).name;
    const fallback = defaultSettings({
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
    const modern = defaultSettings({
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

    const existingFallback = reusableJob(video, "encode", fallback);
    const existingModern = reusableJob(video, "encode", modern);
    const fallbackJob = existingFallback ?? createEncodeJob(video, fallback, "encode", "fallback-h264");
    const modernJob = existingModern ?? createEncodeJob(video, modern, "encode", "modern-av1");
    res.status(202).json({ jobs: [publicJob(fallbackJob), publicJob(modernJob)] });
    if (!existingFallback) runJob(fallbackJob, video.storedPath);
    if (!existingModern) runJob(modernJob, video.storedPath);
  });

  app.post("/api/videos/:id/package", async (req, res, next) => {
    try {
      const video = videos.get(req.params.id);
      if (!video) {
        res.status(404).json({ error: "Video not found" });
        return;
      }

      const requestedJobIds = Array.isArray(req.body?.jobIds) ? (req.body.jobIds as string[]) : [];
      const packageMeta = req.body?.metadata ?? {};
      const packageTitle = String(packageMeta.title || path.parse(video.originalName).name).trim();
      const packageDescription = String(packageMeta.description || `Video for ${packageTitle}.`).trim();
      const packageLanguage = String(packageMeta.language || "en").trim() || "en";
      const filenamePrefix =
        sanitizeFileName(String(packageMeta.filenamePrefix || path.parse(video.originalName).name).trim()) ||
        sanitizeFileName(path.parse(video.originalName).name);
      const candidateJobs = Array.from(jobs.values()).filter(
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
        res.status(400).json({ error: "Create at least one completed video export before packaging." });
        return;
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
          (job) =>
            `- ${job.outputFileName} (${job.settings.outputContainer.toUpperCase()} / ${job.settings.videoCodec})`
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
        ...(posterJob?.outputPath
          ? [{ name: posterName, data: await fs.promises.readFile(posterJob.outputPath) }]
          : []),
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
      const outputPath = path.join(outputDir, `${packageId}-${outputFileName}`);
      await fs.promises.writeFile(outputPath, zip);

      const job = createEncodeJob(
        video,
        defaultSettings({ outputFilename: path.parse(outputFileName).name }),
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
      await saveManifest();

      res.status(201).json(publicJob(job));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(publicJob(job));
  });

  app.patch("/api/jobs/:id", async (req, res, next) => {
    try {
      const job = jobs.get(req.params.id);
      if (!job || !job.outputFileName) {
        res.status(404).json({ error: "Job output not found" });
        return;
      }

      const nextName = String(req.body?.outputFileName ?? "").trim();
      if (!nextName) {
        res.status(400).json({ error: "Enter an output filename." });
        return;
      }

      job.outputFileName = renamedOutputFileName(job.outputFileName, nextName);
      if (job.sidecarFileName && path.extname(job.outputFileName).toLowerCase() === ".vtt") {
        job.sidecarFileName = `${path.parse(job.outputFileName).name}.srt`;
      }
      await saveManifest();
      res.json(publicJob(job));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/jobs/:id/cancel", async (req, res, next) => {
    try {
      const job = jobs.get(req.params.id);
      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      if (job.status !== "running" && job.status !== "queued") {
        res.json(publicJob(job));
        return;
      }

      job.status = "canceled";
      job.message = "Canceled and removed";
      job.completedAt = new Date().toISOString();
      const responseJob = publicJob(job);
      await removeJob(job);
      await saveManifest();
      res.json(responseJob);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/jobs/:id/events", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = () => {
      res.write(`data: ${JSON.stringify(publicJob(job))}\n\n`);
      if (job.status === "completed" || job.status === "failed" || job.status === "canceled") {
        clearInterval(interval);
        res.end();
      }
    };

    const interval = setInterval(send, 1000);
    send();
    req.on("close", () => clearInterval(interval));
  });

  app.get("/api/jobs/:id/download", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || job.status !== "completed" || !job.outputPath || !job.outputFileName) {
      res.status(404).json({ error: "Output not available" });
      return;
    }

    res.download(job.outputPath, job.outputFileName);
  });

  app.get("/api/jobs/:id/sidecar", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || job.status !== "completed" || !job.sidecarPath || !job.sidecarFileName) {
      res.status(404).json({ error: "Sidecar output not available" });
      return;
    }

    res.download(job.sidecarPath, job.sidecarFileName);
  });

  app.get("/api/jobs/:id/captions", async (req, res, next) => {
    try {
      const job = jobs.get(req.params.id);
      if (!job || job.kind !== "subtitle" || job.status !== "completed" || !job.outputPath) {
        res.status(404).json({ error: "Caption output not available" });
        return;
      }

      const vtt = await fs.promises.readFile(job.outputPath, "utf8");
      const srt =
        job.sidecarPath && fs.existsSync(job.sidecarPath)
          ? await fs.promises.readFile(job.sidecarPath, "utf8")
          : vttToSrt(vtt);
      res.json({ vtt, srt });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/jobs/:id/captions", async (req, res, next) => {
    try {
      const job = jobs.get(req.params.id);
      if (!job || job.kind !== "subtitle" || job.status !== "completed" || !job.outputPath) {
        res.status(404).json({ error: "Caption output not available" });
        return;
      }

      const vtt = String(req.body?.vtt ?? "").trim();
      assertLooksLikeVtt(vtt);
      const finalVtt = /^WEBVTT\b/i.test(vtt) ? `${vtt}\n` : `WEBVTT\n\n${vtt}\n`;
      await fs.promises.writeFile(job.outputPath, finalVtt);
      if (job.sidecarPath) {
        await fs.promises.writeFile(job.sidecarPath, vttToSrt(finalVtt));
      }
      job.outputSize = (await stat(job.outputPath)).size;
      job.message = "Captions edited";
      await saveManifest();
      res.json(publicJob(job));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/jobs/:id/mux-subtitles", (req, res) => {
    const videoJob = jobs.get(req.params.id);
    const subtitleJob = jobs.get(String(req.body?.subtitleJobId ?? ""));
    const video = videoJob ? videos.get(videoJob.videoId) : undefined;
    if (
      !videoJob ||
      !video ||
      videoJob.status !== "completed" ||
      !videoJob.outputPath ||
      (videoJob.kind !== "encode" && videoJob.kind !== "mux")
    ) {
      res.status(404).json({ error: "Completed video output not found" });
      return;
    }
    if (
      !subtitleJob ||
      subtitleJob.videoId !== videoJob.videoId ||
      subtitleJob.kind !== "subtitle" ||
      subtitleJob.status !== "completed" ||
      !subtitleJob.outputPath
    ) {
      res.status(400).json({ error: "Completed subtitle output not found" });
      return;
    }

    const job = createMuxJob(video, videoJob, subtitleJob);
    res.status(202).json(publicJob(job));
    runMuxJob(job, videoJob, subtitleJob);
  });

  app.post("/api/jobs/:id/reveal", async (req, res, next) => {
    try {
      const job = jobs.get(req.params.id);
      if (!job || job.status !== "completed" || !job.outputPath || !fs.existsSync(job.outputPath)) {
        res.status(404).json({ error: "Output not available" });
        return;
      }

      await revealInFileManager(job.outputPath);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/jobs/:id/output", async (req, res, next) => {
    const job = jobs.get(req.params.id);
    if (!job || job.status !== "completed" || !job.outputPath || !job.outputFileName) {
      res.status(404).json({ error: "Output not available" });
      return;
    }

    try {
      await streamVideoFile(req, res, job.outputPath, job.outputFileName, "inline");
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/jobs/:id", async (req, res, next) => {
    try {
      const job = jobs.get(req.params.id);
      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      await removeJob(job);
      await pruneOrphanFiles();
      await saveManifest();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/history/delete", async (req, res, next) => {
    try {
      const videoIds = Array.isArray(req.body?.videoIds) ? (req.body.videoIds as string[]) : [];
      const jobIds = Array.isArray(req.body?.jobIds) ? (req.body.jobIds as string[]) : [];

      for (const jobId of jobIds) {
        const job = jobs.get(jobId);
        if (!job) continue;
        await removeJob(job);
      }

      for (const videoId of videoIds) {
        const video = videos.get(videoId);
        if (!video) continue;
        await removeVideoRecord(video);
      }

      await pruneOrphanFiles();
      await saveManifest();
      res.json(historySnapshot());
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/videos/:id", async (req, res, next) => {
    try {
      const video = videos.get(req.params.id);
      if (!video) {
        res.status(404).json({ error: "Video not found" });
        return;
      }

      await removeVideoRecord(video);
      await pruneOrphanFiles();
      await saveManifest();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    const message = error instanceof Error ? error.message : "Unexpected server error";
    res.status(500).json({ error: message });
  });

  app.listen(port, host, () => {
    console.log(`Local Video Optimizer API listening on http://${host}:${port}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
