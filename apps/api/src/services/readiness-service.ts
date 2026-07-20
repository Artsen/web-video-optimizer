import type { Capabilities, ReadinessCheck, ReadinessDto } from "@local-video-optimizer/contracts";
import type { CommandRunner } from "../infrastructure/tools/command-runner.js";
import type { StoragePolicyService } from "../storage/storage-policy-service.js";

export class ReadinessService {
  #capabilities: Promise<Capabilities> | undefined;
  #ffprobeAvailable: Promise<boolean> | undefined;

  constructor(
    private readonly dependencies: {
      getCapabilities: () => Promise<Capabilities>;
      commandRunner: CommandRunner;
      storagePolicy: StoragePolicyService;
      isRuntimeInitialized: () => boolean;
      isManifestLoaded: () => boolean;
    }
  ) {}

  async getReadiness(): Promise<ReadinessDto> {
    const [capabilities, ffprobeAvailable, storageResult] = await Promise.all([
      this.getCachedCapabilities(),
      this.getCachedFfprobeAvailability(),
      this.getStorageResult()
    ]);
    const storageStatus = storageResult.status;
    const storagePressure = storageStatus?.pressure ?? "critical";

    const checks = {
      runtimeInitialized: check(this.dependencies.isRuntimeInitialized(), "API runtime initialized"),
      storageAvailable: check(Boolean(storageStatus), "Managed storage available"),
      manifestLoaded: check(this.dependencies.isManifestLoaded(), "Manifest state loaded"),
      ffmpegAvailable: check(Object.values(pickFfmpegCapabilities(capabilities)).some(Boolean), "FFmpeg available"),
      ffprobeAvailable: check(ffprobeAvailable, "FFprobe available"),
      h264Encoding: check(capabilities.libx264 && capabilities.aac, "H.264/AAC fallback encoding available"),
      modernWebmAv1: check(capabilities.libaomAv1 && capabilities.libopus, "AV1/WebM with Opus available"),
      storagePressure: storagePressureCheck(storagePressure)
    };
    const optional = {
      ytDlpAvailable: optionalCheck(Boolean(capabilities.ytDlp), "yt-dlp available"),
      whisperCppAvailable: optionalCheck(Boolean(capabilities.whisperCpp), "whisper.cpp executable available"),
      whisperModelConfigured: optionalCheck(Boolean(capabilities.whisperModel), "whisper.cpp model configured")
    };
    const requiredChecks = Object.values(checks);
    const requiredFailed = requiredChecks.some((item) => !item.ok);
    const degraded = requiredChecks.some((item) => item.state === "degraded");

    return {
      state: requiredFailed ? "not_ready" : degraded ? "degraded" : "ready",
      checks,
      optional,
      storage: { pressure: storagePressure }
    };
  }

  private getCachedCapabilities(): Promise<Capabilities> {
    this.#capabilities ??= this.dependencies.getCapabilities();
    return this.#capabilities;
  }

  private getCachedFfprobeAvailability(): Promise<boolean> {
    this.#ffprobeAvailable ??= this.dependencies.commandRunner.commandExists("ffprobe", ["-version"]);
    return this.#ffprobeAvailable;
  }

  private async getStorageResult(): Promise<{ status?: Awaited<ReturnType<StoragePolicyService["getStatus"]>> }> {
    try {
      return { status: await this.dependencies.storagePolicy.getStatus() };
    } catch {
      return {};
    }
  }
}

function pickFfmpegCapabilities(
  capabilities: Capabilities
): Pick<Capabilities, "libx264" | "libaomAv1" | "libvpxVp9" | "aac" | "libopus"> {
  return {
    libx264: capabilities.libx264,
    libaomAv1: capabilities.libaomAv1,
    libvpxVp9: capabilities.libvpxVp9,
    aac: capabilities.aac,
    libopus: capabilities.libopus
  };
}

function check(ok: boolean, message: string): ReadinessCheck {
  return { ok, state: ok ? "ready" : "not_ready", message };
}

function optionalCheck(ok: boolean, message: string): ReadinessCheck {
  return { ok, state: ok ? "ready" : "degraded", message };
}

function storagePressureCheck(pressure: "normal" | "warning" | "critical"): ReadinessCheck {
  if (pressure === "critical") {
    return { ok: false, state: "not_ready", message: "Storage pressure is critical" };
  }
  if (pressure === "warning") {
    return { ok: true, state: "degraded", message: "Storage pressure warning" };
  }
  return { ok: true, state: "ready", message: "Storage pressure normal" };
}
