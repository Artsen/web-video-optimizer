import type { ManifestSnapshot } from "../entities/manifest.js";

export type ManifestSource = "primary" | "backup";

export type ManifestLoadResult =
  | { kind: "missing" }
  | {
      kind: "loaded";
      snapshot: ManifestSnapshot;
      source: ManifestSource;
      recoveredFromBackup: boolean;
    };

export interface ManifestStore {
  load(): Promise<ManifestLoadResult>;
  save(snapshot: ManifestSnapshot): Promise<void>;
}
