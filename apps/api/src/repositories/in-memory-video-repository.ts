import type { VideoEntity } from "../entities/video-entity.js";
import type { VideoRepository } from "./video-repository.js";

export class InMemoryVideoRepository implements VideoRepository {
  readonly #videos = new Map<string, VideoEntity>();

  get(id: string): VideoEntity | undefined {
    return this.#videos.get(id);
  }

  getAll(): VideoEntity[] {
    return Array.from(this.#videos.values());
  }

  set(video: VideoEntity): void {
    this.#videos.set(video.id, video);
  }

  delete(id: string): boolean {
    return this.#videos.delete(id);
  }

  findBySourceHash(sourceHash: string): VideoEntity | undefined {
    return this.getAll().find((video) => video.sourceHash === sourceHash);
  }

  clear(): void {
    this.#videos.clear();
  }
}
