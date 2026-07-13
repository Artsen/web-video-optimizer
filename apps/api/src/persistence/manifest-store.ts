import type { ManifestSnapshot } from "../entities/manifest.js";

export interface ManifestStore {
  load(): Promise<ManifestSnapshot | undefined>;
  save(snapshot: ManifestSnapshot): Promise<void>;
}
