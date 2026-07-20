import { describe, expect, it, vi } from "vitest";
import type { Capabilities, StorageStatusDto } from "@local-video-optimizer/contracts";
import type { CommandRunner } from "../infrastructure/tools/command-runner.js";
import type { StoragePolicyService } from "../storage/storage-policy-service.js";
import { ReadinessService } from "./readiness-service.js";

function capabilities(overrides: Partial<Capabilities> = {}): Capabilities {
  return {
    libx264: true,
    libaomAv1: true,
    libvpxVp9: false,
    aac: true,
    libopus: true,
    whisperCpp: false,
    whisperModel: false,
    ytDlp: false,
    ...overrides
  };
}

function storage(overrides: Partial<StorageStatusDto> = {}): StorageStatusDto {
  return {
    managedBytes: 0,
    reservedBytes: 0,
    availableBytes: 1_000_000_000,
    minimumFreeBytes: 1024,
    pressure: "normal",
    areas: {
      uploads: { bytes: 0, fileCount: 0 },
      outputs: { bytes: 0, fileCount: 0 },
      temporary: { bytes: 0, fileCount: 0 },
      staging: { bytes: 0, fileCount: 0 }
    },
    cleanup: { staleTemporaryBytes: 0, staleTemporaryFileCount: 0 },
    ...overrides
  };
}

function service(
  options: {
    capabilities?: Capabilities;
    storage?: StorageStatusDto;
    ffprobe?: boolean;
    initialized?: boolean;
    manifestLoaded?: boolean;
  } = {}
) {
  const getCapabilities = vi.fn().mockResolvedValue(options.capabilities ?? capabilities());
  const commandRunner = {
    commandExists: vi.fn().mockResolvedValue(options.ffprobe ?? true)
  } as unknown as CommandRunner;
  const storagePolicy = {
    getStatus: vi.fn().mockResolvedValue(options.storage ?? storage())
  } as unknown as StoragePolicyService;
  return {
    getCapabilities,
    commandRunner,
    readiness: new ReadinessService({
      getCapabilities,
      commandRunner,
      storagePolicy,
      isRuntimeInitialized: () => options.initialized ?? true,
      isManifestLoaded: () => options.manifestLoaded ?? true
    })
  };
}

describe("ReadinessService", () => {
  it("reports ready when required runtime, tools, codecs, and storage are available", async () => {
    const { readiness } = service();

    await expect(readiness.getReadiness()).resolves.toMatchObject({
      state: "ready",
      checks: {
        runtimeInitialized: { ok: true },
        storageAvailable: { ok: true },
        manifestLoaded: { ok: true },
        ffmpegAvailable: { ok: true },
        ffprobeAvailable: { ok: true },
        h264Encoding: { ok: true },
        modernWebmAv1: { ok: true },
        storagePressure: { ok: true, state: "ready" }
      }
    });
  });

  it("reports degraded for storage pressure warnings and missing optional tools", async () => {
    const { readiness } = service({ storage: storage({ pressure: "warning" }) });

    await expect(readiness.getReadiness()).resolves.toMatchObject({
      state: "degraded",
      checks: { storagePressure: { ok: true, state: "degraded" } },
      optional: {
        ytDlpAvailable: { ok: false, state: "degraded" },
        whisperCppAvailable: { ok: false, state: "degraded" },
        whisperModelConfigured: { ok: false, state: "degraded" }
      }
    });
  });

  it("reports not ready for required capability failures", async () => {
    const { readiness } = service({ capabilities: capabilities({ libx264: false }) });

    await expect(readiness.getReadiness()).resolves.toMatchObject({
      state: "not_ready",
      checks: { h264Encoding: { ok: false, state: "not_ready" } }
    });
  });

  it("caches expensive capability and ffprobe checks between readiness calls", async () => {
    const { commandRunner, getCapabilities, readiness } = service();

    await readiness.getReadiness();
    await readiness.getReadiness();

    expect(getCapabilities).toHaveBeenCalledTimes(1);
    expect(commandRunner.commandExists).toHaveBeenCalledTimes(1);
  });

  it("does not expose raw executable paths or model paths", async () => {
    const { readiness } = service({
      capabilities: capabilities({
        whisperCpp: true,
        whisperModel: true,
        whisperCommand: "D:/whisper-bin-x64/Release/whisper-cli.exe",
        whisperModelPath: "D:/ggml-base.en.bin",
        ytDlpCommand: "C:/tools/yt-dlp.exe",
        ytDlpJsRuntime: "node:C:/Program Files/nodejs/node.exe"
      })
    });

    const result = await readiness.getReadiness();

    expect(JSON.stringify(result)).not.toContain("D:/");
    expect(JSON.stringify(result)).not.toContain("C:/");
    expect(JSON.stringify(result)).not.toContain("whisper-cli.exe");
  });
});
