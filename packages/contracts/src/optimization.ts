import { z } from "zod";

export const OutputContainerSchema = z.enum(["mp4", "webm"]);
export type OutputContainer = z.infer<typeof OutputContainerSchema>;

export const VideoCodecSchema = z.enum(["libx264", "libaom-av1", "libvpx-vp9"]);
export type VideoCodec = z.infer<typeof VideoCodecSchema>;

export const AudioCodecSchema = z.enum(["aac", "libopus"]);
export type AudioCodec = z.infer<typeof AudioCodecSchema>;

export const AudioModeSchema = z.enum(["keep", "compress", "remove"]);
export type AudioMode = z.infer<typeof AudioModeSchema>;

export const EncoderPresetSchema = z.enum(["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow"]);
export type EncoderPreset = z.infer<typeof EncoderPresetSchema>;

export const OptimizationSettingsSchema = z.object({
  outputContainer: OutputContainerSchema,
  videoCodec: VideoCodecSchema,
  audioCodec: AudioCodecSchema,
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  crf: z.number(),
  preset: EncoderPresetSchema,
  cpuUsed: z.number().int().min(0).max(8).optional(),
  rowMt: z.boolean().optional(),
  frameRate: z.number().positive().optional(),
  audioMode: AudioModeSchema,
  audioBitrateKbps: z.number().positive().optional(),
  audioSampleRate: z.number().positive().optional(),
  audioChannels: z.number().int().positive().optional(),
  fastStart: z.boolean(),
  stripMetadata: z.boolean(),
  outputFilename: z.string().optional()
});

export type OptimizationSettings = z.infer<typeof OptimizationSettingsSchema>;

export const OptimizationSettingsInputSchema = z.object({
  outputContainer: OutputContainerSchema.optional(),
  videoCodec: VideoCodecSchema.optional(),
  audioCodec: AudioCodecSchema.optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  crf: z.number().optional(),
  preset: EncoderPresetSchema.optional(),
  cpuUsed: z.number().optional(),
  rowMt: z.boolean().optional(),
  frameRate: z.number().optional(),
  audioMode: AudioModeSchema.optional(),
  audioBitrateKbps: z.number().optional(),
  audioSampleRate: z.number().optional(),
  audioChannels: z.number().optional(),
  fastStart: z.boolean().optional(),
  stripMetadata: z.boolean().optional(),
  outputFilename: z.string().optional()
});
export type OptimizationSettingsInput = z.infer<typeof OptimizationSettingsInputSchema>;
