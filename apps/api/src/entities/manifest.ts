import type { JobEntity } from "./job-entity.js";
import type { VideoEntity } from "./video-entity.js";

export type ManifestSnapshot = {
  videos: VideoEntity[];
  jobs: JobEntity[];
};
