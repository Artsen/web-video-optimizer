import { z } from "zod";
import { StoragePressureSchema } from "./storage.js";

export const ReadinessStateSchema = z.enum(["ready", "degraded", "not_ready"]);
export type ReadinessState = z.infer<typeof ReadinessStateSchema>;

export const ReadinessCheckSchema = z.object({
  ok: z.boolean(),
  state: ReadinessStateSchema,
  message: z.string().optional()
});
export type ReadinessCheck = z.infer<typeof ReadinessCheckSchema>;

export const ReadinessDtoSchema = z.object({
  state: ReadinessStateSchema,
  checks: z.object({
    runtimeInitialized: ReadinessCheckSchema,
    storageAvailable: ReadinessCheckSchema,
    manifestLoaded: ReadinessCheckSchema,
    ffmpegAvailable: ReadinessCheckSchema,
    ffprobeAvailable: ReadinessCheckSchema,
    h264Encoding: ReadinessCheckSchema,
    modernWebmAv1: ReadinessCheckSchema,
    storagePressure: ReadinessCheckSchema
  }),
  optional: z.object({
    ytDlpAvailable: ReadinessCheckSchema,
    whisperCppAvailable: ReadinessCheckSchema,
    whisperModelConfigured: ReadinessCheckSchema
  }),
  storage: z.object({
    pressure: StoragePressureSchema
  })
});
export type ReadinessDto = z.infer<typeof ReadinessDtoSchema>;
