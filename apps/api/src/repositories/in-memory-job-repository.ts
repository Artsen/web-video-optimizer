import type { JobEntity } from "../entities/job-entity.js";
import type { JobRepository } from "./job-repository.js";

export class InMemoryJobRepository implements JobRepository {
  readonly #jobs = new Map<string, JobEntity>();

  get(id: string): JobEntity | undefined {
    return this.#jobs.get(id);
  }

  getAll(): JobEntity[] {
    return Array.from(this.#jobs.values());
  }

  set(job: JobEntity): void {
    this.#jobs.set(job.id, job);
  }

  delete(id: string): boolean {
    return this.#jobs.delete(id);
  }

  findByVideoId(videoId: string): JobEntity[] {
    return this.getAll().filter((job) => job.videoId === videoId);
  }

  clear(): void {
    this.#jobs.clear();
  }
}
