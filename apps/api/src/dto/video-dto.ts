import type { VideoRecordDto } from "@local-video-optimizer/contracts";
import type { VideoEntity } from "../entities/video-entity.js";

export function toVideoRecordDto(video: VideoEntity): VideoRecordDto {
  return {
    id: video.id,
    originalName: video.originalName,
    uploadedAt: video.uploadedAt,
    metadata: video.metadata
  };
}
