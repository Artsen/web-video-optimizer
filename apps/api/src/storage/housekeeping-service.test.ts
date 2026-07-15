import { describe, expect, it, vi } from "vitest";
import type { StoragePolicyService } from "./storage-policy-service.js";
import { StorageHousekeepingService } from "./housekeeping-service.js";

describe("StorageHousekeepingService", () => {
  it("runs at startup and on an interval without overlapping cleanups", async () => {
    vi.useFakeTimers();
    try {
      let resolveCleanup!: () => void;
      const cleanupPromise = new Promise<void>((resolve) => {
        resolveCleanup = resolve;
      });
      const policy = {
        cleanupStaleTemporaryFiles: vi.fn(async () => {
          await cleanupPromise;
          return { removedBytes: 1, removedFileCount: 1, storage: {} };
        })
      } as unknown as StoragePolicyService;

      const service = new StorageHousekeepingService(policy, 1000);
      service.start();
      await vi.advanceTimersByTimeAsync(1000);

      expect(policy.cleanupStaleTemporaryFiles).toHaveBeenCalledTimes(1);
      resolveCleanup();
      await service.runOnce();
      expect(policy.cleanupStaleTemporaryFiles).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(policy.cleanupStaleTemporaryFiles).toHaveBeenCalledTimes(2);
      await service.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the timer and waits for an in-flight cleanup during shutdown", async () => {
    vi.useFakeTimers();
    try {
      let resolveCleanup!: () => void;
      const policy = {
        cleanupStaleTemporaryFiles: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveCleanup = () => resolve({ removedBytes: 0, removedFileCount: 0, storage: {} });
            })
        )
      } as unknown as StoragePolicyService;

      const service = new StorageHousekeepingService(policy, 1000);
      service.start();
      const stopped = service.stop();
      resolveCleanup();
      await stopped;
      await vi.advanceTimersByTimeAsync(3000);

      expect(policy.cleanupStaleTemporaryFiles).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
