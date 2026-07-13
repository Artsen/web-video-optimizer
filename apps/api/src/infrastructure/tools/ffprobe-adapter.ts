import type { FFprobeResult } from "@local-video-optimizer/video-core";
import type { CommandRunner } from "./command-runner.js";

export interface MediaProbe {
  probe(filePath: string): Promise<FFprobeResult>;
}

export class FfprobeAdapter implements MediaProbe {
  constructor(private readonly commandRunner: CommandRunner) {}

  async probe(filePath: string): Promise<FFprobeResult> {
    return this.commandRunner.runJson("ffprobe", [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath
    ]) as Promise<FFprobeResult>;
  }
}
