import type { VideoRecordDto } from "@local-video-optimizer/contracts";

export type VideoEntity = VideoRecordDto & {
  storedPath: string;
  sourceHash?: string;
};
