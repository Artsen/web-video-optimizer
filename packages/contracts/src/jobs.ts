import { z } from "zod";
import { OptimizationSettingsSchema } from "./optimization.js";

export const JobIdSchema = z.string().min(1);
export type JobId = z.infer<typeof JobIdSchema>;

export const VideoIdSchema = z.string().min(1);
export type VideoId = z.infer<typeof VideoIdSchema>;

export const JobKindSchema = z.enum(["encode", "sample", "poster", "package", "subtitle", "mux"]);
export type JobKind = z.infer<typeof JobKindSchema>;

export const JobStatusSchema = z.enum(["queued", "running", "completed", "failed", "canceled"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const SampleEstimateSchema = z.object({
  sampleSeconds: z.number().positive(),
  estimatedFullSize: z.number().nonnegative(),
  estimatedReduction: z.number().optional()
});

export type SampleEstimate = z.infer<typeof SampleEstimateSchema>;

export const JobDtoSchema = z.object({
  id: JobIdSchema,
  videoId: VideoIdSchema,
  status: JobStatusSchema,
  kind: JobKindSchema,
  progress: z.number().min(0).max(100),
  message: z.string().optional(),
  outputFileName: z.string().optional(),
  sidecarFileName: z.string().optional(),
  outputSize: z.number().nonnegative().optional(),
  ffmpegCommand: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  settings: OptimizationSettingsSchema,
  sampleEstimate: SampleEstimateSchema.optional()
});

export type JobDto = z.infer<typeof JobDtoSchema>;
