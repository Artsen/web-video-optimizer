import { z } from "zod";

export const TrackCountsSchema = z.object({
  video: z.number().int().nonnegative(),
  audio: z.number().int().nonnegative(),
  subtitle: z.number().int().nonnegative()
});

export type TrackCounts = z.infer<typeof TrackCountsSchema>;

export const ColorMetadataSchema = z.object({
  space: z.string().optional(),
  transfer: z.string().optional(),
  primaries: z.string().optional()
});

export type ColorMetadata = z.infer<typeof ColorMetadataSchema>;

export const VideoMetadataSchema = z.object({
  fileName: z.string(),
  fileSize: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  container: z.string(),
  formatLongName: z.string().optional(),
  videoCodec: z.string().optional(),
  audioCodec: z.string().optional(),
  trackCounts: TrackCountsSchema,
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  displayAspectRatio: z.string().optional(),
  frameRate: z.number().positive().optional(),
  overallBitrate: z.number().nonnegative().optional(),
  videoBitrate: z.number().nonnegative().optional(),
  audioBitrate: z.number().nonnegative().optional(),
  audioSampleRate: z.number().positive().optional(),
  audioChannels: z.number().int().positive().optional(),
  pixelFormat: z.string().optional(),
  color: ColorMetadataSchema.optional(),
  rotation: z.string().optional(),
  tags: z.record(z.string()).optional(),
  webFriendly: z.boolean(),
  warnings: z.array(z.string())
});

export type VideoMetadata = z.infer<typeof VideoMetadataSchema>;

export const VideoRecordDtoSchema = z.object({
  id: z.string().min(1),
  originalName: z.string(),
  uploadedAt: z.string(),
  metadata: VideoMetadataSchema
});

export type VideoRecordDto = z.infer<typeof VideoRecordDtoSchema>;
