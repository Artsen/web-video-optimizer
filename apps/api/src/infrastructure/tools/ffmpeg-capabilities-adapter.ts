import type { Capabilities } from "@local-video-optimizer/contracts";
import type { CommandRunner } from "./command-runner.js";

export type FfmpegEncoderCapabilities = Pick<Capabilities, "libx264" | "libaomAv1" | "libvpxVp9" | "aac" | "libopus">;

export interface FfmpegCapabilitiesAdapter {
  getCapabilities(): Promise<FfmpegEncoderCapabilities>;
}

export class ProcessFfmpegCapabilitiesAdapter implements FfmpegCapabilitiesAdapter {
  constructor(private readonly commandRunner: CommandRunner) {}

  async getCapabilities(): Promise<FfmpegEncoderCapabilities> {
    try {
      const result = await this.commandRunner.run("ffmpeg", ["-hide_banner", "-encoders"]);
      const output = `${result.stdout}\n${result.stderr}`;
      return {
        libx264: output.includes("libx264"),
        libaomAv1: output.includes("libaom-av1"),
        libvpxVp9: output.includes("libvpx-vp9"),
        aac: /\bAAC\b| aac\s/.test(output),
        libopus: output.includes("libopus")
      };
    } catch {
      return { libx264: false, libaomAv1: false, libvpxVp9: false, aac: false, libopus: false };
    }
  }
}
