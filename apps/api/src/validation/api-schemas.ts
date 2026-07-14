import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  AudioCodecSchema,
  AudioModeSchema,
  EncoderPresetSchema,
  OutputContainerSchema,
  VideoCodecSchema
} from "@local-video-optimizer/contracts";

const safeIdPattern = /^[A-Za-z0-9_-]+$/;
const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function finiteNumber() {
  return z.number().finite();
}

function hasAsciiControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export const SafeIdSchema = z
  .string()
  .trim()
  .min(1, "Expected a non-empty ID")
  .max(128, "ID is too long")
  .regex(safeIdPattern, "ID contains unsupported characters");

export const IdParamsSchema = z.object({ id: SafeIdSchema }).strict();

export const SubtitleJobIdBodySchema = z
  .object({
    subtitleJobId: SafeIdSchema
  })
  .strict();

function fileNameSchema(emptyMessage: string) {
  return z
    .string()
    .trim()
    .min(1, emptyMessage)
    .refine((value) => utf8ByteLength(value) <= 255, "Filename is too long")
    .refine((value) => !hasAsciiControlCharacter(value), "Filename contains control characters")
    .refine((value) => !value.includes("/") && !value.includes("\\"), "Filename cannot contain path separators")
    .refine((value) => value !== "." && value !== "..", "Filename cannot be . or ..");
}

export const OutputFileNameSchema = fileNameSchema("Enter an output filename.");

export const SourceFileNameSchema = fileNameSchema("Enter a source filename.");

const PackageFileNameSchema = fileNameSchema("Expected a non-empty filename");

export const RenameVideoBodySchema = z
  .object({
    originalName: SourceFileNameSchema
  })
  .strict();

export const RenameJobBodySchema = z
  .object({
    outputFileName: OutputFileNameSchema
  })
  .strict();

export const OptimizationRequestBodySchema = z
  .object({
    outputContainer: OutputContainerSchema.optional(),
    videoCodec: VideoCodecSchema.optional(),
    audioCodec: AudioCodecSchema.optional(),
    width: z.number().int().positive().max(7680).optional(),
    height: z.number().int().positive().max(4320).optional(),
    crf: finiteNumber().min(0).max(63).optional(),
    preset: EncoderPresetSchema.optional(),
    cpuUsed: z.number().int().min(0).max(8).optional(),
    rowMt: z.boolean().optional(),
    frameRate: finiteNumber().positive().max(240).optional(),
    audioMode: AudioModeSchema.optional(),
    audioBitrateKbps: finiteNumber().positive().max(1024).optional(),
    audioSampleRate: z.number().int().positive().max(192000).optional(),
    audioChannels: z.number().int().positive().max(8).optional(),
    fastStart: z.boolean().optional(),
    stripMetadata: z.boolean().optional(),
    outputFilename: OutputFileNameSchema.optional()
  })
  .strict();

export const SampleRequestBodySchema = OptimizationRequestBodySchema.extend({
  sampleSeconds: finiteNumber().positive().max(600).optional()
}).strict();

export const PosterRequestBodySchema = z
  .object({
    atSeconds: finiteNumber().nonnegative().optional()
  })
  .strict();

export const EmptyBodySchema = z.object({}).strict();

export const HistoryDeleteBodySchema = z
  .object({
    videoIds: z.array(SafeIdSchema).max(1000).optional().default([]),
    jobIds: z.array(SafeIdSchema).max(1000).optional().default([])
  })
  .strict()
  .transform((value) => ({
    videoIds: Array.from(new Set(value.videoIds)),
    jobIds: Array.from(new Set(value.jobIds))
  }));

export function captionUpdateBodySchema(maxBytes: number) {
  return z
    .object({
      vtt: z.string().refine((value) => utf8ByteLength(value) <= maxBytes, "Caption text is too large")
    })
    .strict();
}

export const PackageRequestBodySchema = z
  .object({
    jobIds: z.array(SafeIdSchema).max(1000).optional().default([]),
    metadata: z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().min(1).max(2000).optional(),
        language: z
          .string()
          .trim()
          .min(1)
          .max(32)
          .regex(/^[A-Za-z0-9_-]+$/)
          .optional(),
        filenamePrefix: PackageFileNameSchema.optional()
      })
      .strict()
      .optional()
  })
  .strict()
  .transform((value) => ({
    ...value,
    jobIds: Array.from(new Set(value.jobIds))
  }));

export const ImportUrlBodySchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1, "Enter a valid YouTube URL.")
      .max(2048, "Enter a valid YouTube URL.")
      .transform((value, context) => {
        let parsed: URL;
        try {
          parsed = new URL(value);
        } catch {
          context.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid YouTube URL." });
          return z.NEVER;
        }

        const hostname = parsed.hostname.toLowerCase();
        if (
          parsed.protocol !== "https:" ||
          parsed.username ||
          parsed.password ||
          (parsed.port && parsed.port !== "443") ||
          !youtubeHosts.has(hostname)
        ) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid YouTube URL." });
          return z.NEVER;
        }

        parsed.hostname = hostname;
        return parsed.toString();
      })
  })
  .strict();
