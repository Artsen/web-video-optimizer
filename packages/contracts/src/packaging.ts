import { z } from "zod";
import { JobIdSchema } from "./jobs.js";

export const PackageMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  language: z.string(),
  filenamePrefix: z.string()
});

export type PackageMetadata = z.infer<typeof PackageMetadataSchema>;

export const PackageRequestSchema = z.object({
  jobIds: z.array(JobIdSchema),
  metadata: PackageMetadataSchema.partial().optional()
});

export type PackageRequest = z.infer<typeof PackageRequestSchema>;
