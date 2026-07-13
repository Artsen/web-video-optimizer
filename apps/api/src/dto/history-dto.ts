import type { HistorySnapshot } from "@local-video-optimizer/contracts";
import type { JobEntity, VideoEntity } from "../runtime/api-runtime.js";
import { toJobDto } from "./job-dto.js";
import { toVideoRecordDto } from "./video-dto.js";

export function toHistorySnapshotDto(videos: VideoEntity[], jobs: JobEntity[]): HistorySnapshot {
  return {
    videos: videos.map((video) => ({
      ...toVideoRecordDto(video),
      jobIds: jobs.filter((job) => job.videoId === video.id).map((job) => job.id)
    })),
    jobs: jobs.map(toJobDto).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  };
}
