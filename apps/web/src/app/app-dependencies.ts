import type { VideoOptimizerApi } from "../api/api-client";
import type { JobEvents } from "../api/job-events";

export type AppDependencies = {
  api: VideoOptimizerApi;
  apiBaseUrl: string;
  jobEvents: JobEvents;
};
