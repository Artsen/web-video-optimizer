import { describe, expect, it } from "vitest";
import { StorageCleanupResultDtoSchema, StorageStatusDtoSchema } from "../src/index.js";

const status = {
  managedBytes: 1000,
  reservedBytes: 250,
  availableBytes: 5000,
  totalFilesystemBytes: 10_000,
  configuredMaxBytes: 20_000,
  minimumFreeBytes: 1000,
  pressure: "warning",
  areas: {
    uploads: { bytes: 500, fileCount: 1 },
    outputs: { bytes: 400, fileCount: 2 },
    temporary: { bytes: 100, fileCount: 1 },
    staging: { bytes: 0, fileCount: 0 }
  },
  cleanup: {
    staleTemporaryBytes: 100,
    staleTemporaryFileCount: 1
  }
};

describe("storage contracts", () => {
  it("accepts aggregate storage status and cleanup responses", () => {
    expect(StorageStatusDtoSchema.parse(status)).toEqual(status);
    expect(
      StorageCleanupResultDtoSchema.parse({
        removedBytes: 100,
        removedFileCount: 1,
        storage: status
      })
    ).toMatchObject({ removedBytes: 100, storage: status });
  });

  it("rejects private storage implementation fields", () => {
    const result = StorageStatusDtoSchema.strict().safeParse({
      ...status,
      storageRoot: "D:\\private",
      manifestPath: "D:\\private\\manifest.json",
      filename: "source.mp4",
      sourceHash: "abc123"
    });

    expect(result.success).toBe(false);
  });
});
