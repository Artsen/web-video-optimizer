import { describe, expect, it } from "vitest";
import { ReadinessDtoSchema } from "../src/readiness.js";

describe("ReadinessDtoSchema", () => {
  it("accepts the redacted readiness response shape", () => {
    const parsed = ReadinessDtoSchema.parse({
      state: "degraded",
      checks: {
        runtimeInitialized: { ok: true, state: "ready" },
        storageAvailable: { ok: true, state: "ready" },
        manifestLoaded: { ok: true, state: "ready" },
        ffmpegAvailable: { ok: true, state: "ready" },
        ffprobeAvailable: { ok: true, state: "ready" },
        h264Encoding: { ok: true, state: "ready" },
        modernWebmAv1: { ok: true, state: "ready" },
        storagePressure: { ok: true, state: "degraded", message: "Storage pressure warning" }
      },
      optional: {
        ytDlpAvailable: { ok: false, state: "degraded" },
        whisperCppAvailable: { ok: false, state: "degraded" },
        whisperModelConfigured: { ok: false, state: "degraded" }
      },
      storage: { pressure: "warning" }
    });

    expect(parsed.state).toBe("degraded");
  });
});
