import type { VideoEntity } from "../entities/video-entity.js";

export interface VideoRepository {
  get(id: string): VideoEntity | undefined;
  getAll(): VideoEntity[];
  set(video: VideoEntity): void;
  delete(id: string): boolean;
  findBySourceHash(sourceHash: string): VideoEntity | undefined;
  clear(): void;
}
