import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent, Stats } from "node:fs";
import type { StorageArea, StorageBoundary } from "./storage-boundary.js";
import { isPathInside } from "./storage-boundary.js";

export type StorageAreaUsage = {
  bytes: number;
  fileCount: number;
};

export type StaleTemporaryEntry = {
  area: "tmp" | "upload-staging";
  path: string;
  bytes: number;
};

export type ManagedStorageInventory = {
  areas: {
    uploads: StorageAreaUsage;
    outputs: StorageAreaUsage;
    temporary: StorageAreaUsage;
    staging: StorageAreaUsage;
  };
  staleTemporary: StorageAreaUsage;
  staleEntries: StaleTemporaryEntry[];
  managedBytes: number;
};

const emptyUsage = (): StorageAreaUsage => ({ bytes: 0, fileCount: 0 });

export class ManagedStorageInventoryService {
  constructor(
    private readonly storage: StorageBoundary,
    private readonly clock: () => number = () => Date.now()
  ) {}

  async measure(tempFileMaxAgeMs: number): Promise<ManagedStorageInventory> {
    const uploads = await this.measureArea("uploads");
    const outputs = await this.measureArea("outputs");
    const stagingResult = await this.measureTemporaryArea("upload-staging", tempFileMaxAgeMs);
    const temporaryResult = await this.measureTemporaryArea(
      "tmp",
      tempFileMaxAgeMs,
      this.storage.roots["upload-staging"]
    );
    const staleTemporary = {
      bytes: temporaryResult.stale.bytes + stagingResult.stale.bytes,
      fileCount: temporaryResult.stale.fileCount + stagingResult.stale.fileCount
    };
    return {
      areas: {
        uploads,
        outputs,
        temporary: temporaryResult.usage,
        staging: stagingResult.usage
      },
      staleTemporary,
      staleEntries: [...temporaryResult.staleEntries, ...stagingResult.staleEntries],
      managedBytes: uploads.bytes + outputs.bytes + temporaryResult.usage.bytes + stagingResult.usage.bytes
    };
  }

  private async measureArea(area: "uploads" | "outputs"): Promise<StorageAreaUsage> {
    const usage = emptyUsage();
    await this.walk(area, this.storage.roots[area], undefined, async (filePath, stats) => {
      void filePath;
      usage.bytes = safeAdd(usage.bytes, stats.size);
      usage.fileCount += 1;
    });
    return usage;
  }

  private async measureTemporaryArea(
    area: "tmp" | "upload-staging",
    tempFileMaxAgeMs: number,
    excludedRoot?: string
  ): Promise<{ usage: StorageAreaUsage; stale: StorageAreaUsage; staleEntries: StaleTemporaryEntry[] }> {
    const usage = emptyUsage();
    const stale = emptyUsage();
    const staleEntries: StaleTemporaryEntry[] = [];
    const now = this.clock();
    await this.walk(area, this.storage.roots[area], excludedRoot, async (filePath, stats) => {
      usage.bytes = safeAdd(usage.bytes, stats.size);
      usage.fileCount += 1;
      const ageMs = now - stats.mtimeMs;
      if (ageMs >= tempFileMaxAgeMs && ageMs >= 0) {
        stale.bytes = safeAdd(stale.bytes, stats.size);
        stale.fileCount += 1;
        staleEntries.push({ area, path: filePath, bytes: stats.size });
      }
    });
    return { usage, stale, staleEntries };
  }

  private async walk(
    area: StorageArea,
    directory: string,
    excludedRoot: string | undefined,
    onFile: (filePath: string, stats: Stats) => Promise<void>
  ): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const candidate = path.join(directory, entry.name);
        if (excludedRoot && (candidate === excludedRoot || isPathInside(excludedRoot, candidate))) return;
        if (!isPathInside(this.storage.roots[area], candidate)) return;
        let stats: Awaited<ReturnType<typeof fs.lstat>>;
        try {
          stats = await fs.lstat(candidate);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
          throw error;
        }
        if (stats.isSymbolicLink()) return;
        if (stats.isDirectory()) {
          await this.walk(area, candidate, excludedRoot, onFile);
          return;
        }
        if (stats.isFile()) await onFile(candidate, stats);
      })
    );
  }
}

function safeAdd(left: number, right: number): number {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("Managed storage usage is too large to represent safely");
  return total;
}
