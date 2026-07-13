import { z } from "zod";

export const CapabilitiesSchema = z.object({
  libx264: z.boolean(),
  libaomAv1: z.boolean(),
  libvpxVp9: z.boolean(),
  aac: z.boolean(),
  libopus: z.boolean(),
  whisperCpp: z.boolean().optional(),
  whisperModel: z.boolean().optional(),
  whisperCommand: z.string().optional(),
  whisperModelPath: z.string().optional(),
  ytDlp: z.boolean().optional(),
  ytDlpCommand: z.string().optional(),
  ytDlpJsRuntime: z.string().optional()
});

export type Capabilities = z.infer<typeof CapabilitiesSchema>;
