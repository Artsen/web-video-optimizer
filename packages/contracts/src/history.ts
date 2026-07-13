import { z } from "zod";
import { JobDtoSchema, JobIdSchema } from "./jobs.js";
import { VideoRecordDtoSchema } from "./video.js";

export const HistoryVideoSchema = VideoRecordDtoSchema.extend({
  jobIds: z.array(JobIdSchema)
});

export type HistoryVideo = z.infer<typeof HistoryVideoSchema>;

export const HistorySnapshotSchema = z.object({
  videos: z.array(HistoryVideoSchema),
  jobs: z.array(JobDtoSchema)
});

export type HistorySnapshot = z.infer<typeof HistorySnapshotSchema>;
