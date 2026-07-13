import type { JobEntity } from "../entities/job-entity.js";

export interface JobRepository {
  get(id: string): JobEntity | undefined;
  getAll(): JobEntity[];
  set(job: JobEntity): void;
  delete(id: string): boolean;
  findByVideoId(videoId: string): JobEntity[];
  clear(): void;
}
