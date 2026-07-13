import type { Capabilities } from "@local-video-optimizer/contracts";
import type { ProcessRunner } from "../processes/process-runner.js";

export type FfmpegEncoderCapabilities = Pick<Capabilities, "libx264" | "libaomAv1" | "libvpxVp9" | "aac" | "libopus">;

export interface FfmpegCapabilitiesAdapter {
  getCapabilities(): Promise<FfmpegEncoderCapabilities>;
}

export class ProcessFfmpegCapabilitiesAdapter implements FfmpegCapabilitiesAdapter {
  constructor(private readonly processRunner: ProcessRunner) {}

  async getCapabilities(): Promise<FfmpegEncoderCapabilities> {
    return new Promise((resolve) => {
      const child = this.processRunner["spawn"]("ffmpeg", ["-hide_banner", "-encoders"], { windowsHide: true });
      let output = "";
      child.stdout?.on("data", (chunk) => {
        output += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        output += String(chunk);
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
}
