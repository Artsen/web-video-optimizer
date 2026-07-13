import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { ApiConfig } from "../../config.js";
import type { ProcessRunner } from "../processes/process-runner.js";
import type { CommandRunner } from "./command-runner.js";

export interface VideoDownloader {
  resolveCommand(): Promise<string | undefined>;
  jsRuntimeValue(): string;
  jsRuntimeArgs(): string[];
  download(url: string, tmpDir: string): Promise<string>;
}

export function stripWrappingQuotes(value: string): string {
  return value.replace(/^"|"$/g, "");
}

export class YtDlpAdapter implements VideoDownloader {
  constructor(
    private readonly config: ApiConfig,
    private readonly commandRunner: CommandRunner,
    private readonly processRunner: ProcessRunner
  ) {}

  async resolveCommand(): Promise<string | undefined> {
    const configuredCommand = this.config.ytDlpBin;
    const candidates = configuredCommand ? [stripWrappingQuotes(configuredCommand)] : ["yt-dlp", "yt-dlp.exe"];
    for (const candidate of candidates) {
      if (await this.commandRunner.commandExists(candidate, ["--version"])) return candidate;
    }
    return undefined;
  }

  jsRuntimeValue(): string {
    return stripWrappingQuotes(this.config.ytDlpJsRuntime);
  }

  jsRuntimeArgs(): string[] {
    return ["--js-runtimes", this.jsRuntimeValue()];
  }

  async download(url: string, tmpDir: string): Promise<string> {
    const ytDlpCommand = await this.resolveCommand();
    if (!ytDlpCommand) {
      throw new Error("yt-dlp was not found. Install yt-dlp or set YT_DLP_BIN to enable URL imports.");
    }

    const importId = nanoid();
    const downloadDir = path.join(tmpDir, `url-import-${importId}`);
    await fs.promises.mkdir(downloadDir, { recursive: true });
    const outputTemplate = path.join(downloadDir, "%(title).180B-%(id)s.%(ext)s");

    try {
      await new Promise<void>((resolve, reject) => {
        const child = this.processRunner["spawn"](
          ytDlpCommand,
          [
            "--no-playlist",
            "--restrict-filenames",
            "--windows-filenames",
            "--newline",
            ...this.jsRuntimeArgs(),
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
        child.stdout?.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.stderr?.on("data", (chunk) => {
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
      await fs.promises.rm(downloadDir, { recursive: true, force: true });
      throw error;
    }

    const files = (await fs.promises.readdir(downloadDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(downloadDir, entry.name));
    const videoFile = files.find((file) => /\.(mp4|webm|mkv|mov|m4v)$/i.test(file)) ?? files[0];
    if (!videoFile) {
      await fs.promises.rm(downloadDir, { recursive: true, force: true });
      throw new Error("yt-dlp did not create a downloadable video file.");
    }

    const importPath = path.join(tmpDir, `${importId}-${path.basename(videoFile)}`);
    await fs.promises.rename(videoFile, importPath);
    await fs.promises.rm(downloadDir, { recursive: true, force: true });
    return importPath;
  }
}
