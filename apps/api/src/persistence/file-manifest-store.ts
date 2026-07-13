import fs from "node:fs";
import type { ManifestSnapshot } from "../entities/manifest.js";
import type { ManifestStore } from "./manifest-store.js";

export class FileManifestStore implements ManifestStore {
  constructor(readonly manifestPath: string) {}

  async load(): Promise<ManifestSnapshot | undefined> {
    try {
      const raw = await fs.promises.readFile(this.manifestPath, "utf8");
      return JSON.parse(raw) as ManifestSnapshot;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("Unable to load manifest:", error);
      }
      return undefined;
    }
  }

  async save(snapshot: ManifestSnapshot): Promise<void> {
    await fs.promises.writeFile(this.manifestPath, JSON.stringify(snapshot, null, 2));
  }
}
