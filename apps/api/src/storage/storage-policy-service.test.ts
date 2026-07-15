import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ManagedStorageInventoryService } from "./managed-storage-inventory.js";
import { StorageBoundary } from "./storage-boundary.js";
import type { StorageCapacityProvider } from "./storage-capacity.js";
import { StoragePolicyService } from "./storage-policy-service.js";
import { StorageReservationManager } from "./storage-reservations.js";

const tempDirs: string[] = [];

async function makeStorage() {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-video-storage-policy-"));
  tempDirs.push(root);
  const storage = new StorageBoundary({
    root,
    uploads: path.join(root, "uploads"),
    outputs: path.join(root, "outputs"),
    tmp: path.join(root, "tmp"),
    "upload-staging": path.join(root, "tmp", "upload-staging")
  });
  await storage.initialize();
  return { root, storage };
}

async function trySymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    await symlink(target, linkPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return false;
    throw error;
  }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("StoragePolicyService", () => {
  it("inventories managed areas, ignores symlink targets, and reports stale temporary cleanup", async () => {
    const { root, storage } = await makeStorage();
    await writeFile(path.join(root, "uploads", "source.mp4"), "source");
    await writeFile(path.join(root, "outputs", "output.mp4"), "output");
    const staleTemp = path.join(root, "tmp", "old.tmp");
    await writeFile(staleTemp, "temporary");
    await writeFile(path.join(root, "tmp", "upload-staging", "staged.tmp"), "staging");
    const outside = path.join(await mkdtemp(path.join(os.tmpdir(), "web-video-outside-")), "outside.txt");
    tempDirs.push(path.dirname(outside));
    await writeFile(outside, "outside");
    const symlinkCreated = await trySymlink(outside, path.join(root, "tmp", "linked"));

    const old = Date.now() - 10_000;
    await import("node:fs/promises").then((fs) => fs.utimes(staleTemp, old / 1000, old / 1000));

    const inventory = await new ManagedStorageInventoryService(storage).measure(1000);

    expect(inventory.areas.uploads).toEqual({ bytes: 6, fileCount: 1 });
    expect(inventory.areas.outputs).toEqual({ bytes: 6, fileCount: 1 });
    expect(inventory.areas.temporary.fileCount).toBe(1);
    if (symlinkCreated) expect(inventory.areas.temporary.bytes).toBe(9);
    expect(inventory.areas.staging.fileCount).toBe(1);
    expect(inventory.staleTemporary.fileCount).toBe(1);
    expect(inventory.managedBytes).toBe(28);
  });

  it("computes pressure, reservations, quota rejection, and safe stale cleanup", async () => {
    const { root, storage } = await makeStorage();
    const stale = path.join(root, "tmp", "stale.tmp");
    await writeFile(stale, "old");
    const old = Date.now() - 10_000;
    await import("node:fs/promises").then((fs) => fs.utimes(stale, old / 1000, old / 1000));
    const capacity: StorageCapacityProvider = {
      async getCapacity() {
        return { availableBytes: 2000, totalBytes: 10_000 };
      }
    };
    const reservations = new StorageReservationManager();
    const policy = new StoragePolicyService(
      {
        storageRoot: root,
        minFreeStorageBytes: 1000,
        maxManagedStorageBytes: 0,
        tempFileMaxAgeMs: 1000
      },
      storage,
      capacity,
      new ManagedStorageInventoryService(storage),
      reservations
    );

    expect((await policy.getStatus()).pressure).toBe("warning");
    const reservation = await policy.reserve({ operation: "poster", requiredBytes: 100 });
    expect(reservations.reservedBytes).toBe(100);
    await expect(policy.getStatus()).resolves.toMatchObject({
      managedBytes: 3,
      reservedBytes: 100,
      pressure: "warning"
    });
    reservation.release();
    reservation.release();
    expect(reservations.reservedBytes).toBe(0);
    await expect(policy.assertCanAllocate({ operation: "encode", requiredBytes: 2500 })).rejects.toMatchObject({
      status: 507,
      code: "INSUFFICIENT_STORAGE"
    });

    const cleanup = await policy.cleanupStaleTemporaryFiles();
    expect(cleanup.removedFileCount).toBe(1);
    expect(cleanup.storage.cleanup.staleTemporaryFileCount).toBe(0);
  });

  it("rejects unsafe allocation sizes before creating reservations", async () => {
    const { root, storage } = await makeStorage();
    const policy = new StoragePolicyService(
      {
        storageRoot: root,
        minFreeStorageBytes: 1000,
        maxManagedStorageBytes: 0,
        tempFileMaxAgeMs: 1000
      },
      storage,
      {
        async getCapacity() {
          return { availableBytes: Number.MAX_SAFE_INTEGER, totalBytes: Number.MAX_SAFE_INTEGER };
        }
      },
      new ManagedStorageInventoryService(storage),
      new StorageReservationManager()
    );

    await expect(policy.reserve({ operation: "encode", requiredBytes: Number.MAX_SAFE_INTEGER + 1 })).rejects.toThrow(
      "Invalid storage allocation size"
    );
    await expect(
      policy.reserveMany([
        { operation: "encode", requiredBytes: Number.MAX_SAFE_INTEGER },
        { operation: "encode", requiredBytes: 1 }
      ])
    ).rejects.toThrow("Invalid storage allocation size");
    await expect(policy.getStatus()).resolves.toMatchObject({ reservedBytes: 0 });
  });

  it("reduces the safe upload limit by active reservations", async () => {
    const { root, storage } = await makeStorage();
    await writeFile(path.join(root, "uploads", "source.mp4"), "abc");
    const policy = new StoragePolicyService(
      {
        storageRoot: root,
        minFreeStorageBytes: 1000,
        maxManagedStorageBytes: 1000,
        tempFileMaxAgeMs: 1000
      },
      storage,
      {
        async getCapacity() {
          return { availableBytes: 10_000_000, totalBytes: 20_000_000 };
        }
      },
      new ManagedStorageInventoryService(storage),
      new StorageReservationManager()
    );

    const reservation = await policy.reserve({ operation: "encode", requiredBytes: 400 });

    await expect(policy.getSafeUploadLimit(900)).resolves.toBe(597);
    reservation.release();
  });

  it("serializes concurrent admission decisions against active reservations", async () => {
    const { root, storage } = await makeStorage();
    const capacity: StorageCapacityProvider = {
      async getCapacity() {
        return { availableBytes: 2500, totalBytes: 10_000 };
      }
    };
    const policy = new StoragePolicyService(
      {
        storageRoot: root,
        minFreeStorageBytes: 1000,
        maxManagedStorageBytes: 0,
        tempFileMaxAgeMs: 1000
      },
      storage,
      capacity,
      new ManagedStorageInventoryService(storage),
      new StorageReservationManager()
    );

    const results = await Promise.allSettled([
      policy.reserve({ operation: "encode", requiredBytes: 900 }),
      policy.reserve({ operation: "encode", requiredBytes: 900 })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const reservation = results.find(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof policy.reserve>>> =>
        result.status === "fulfilled"
    )?.value;
    expect((await policy.getStatus()).reservedBytes).toBe(900);
    reservation?.release();
    expect((await policy.getStatus()).reservedBytes).toBe(0);
  });

  it("rejects batch reservations when individual allocations fit but the combined total does not", async () => {
    const { root, storage } = await makeStorage();
    const policy = new StoragePolicyService(
      {
        storageRoot: root,
        minFreeStorageBytes: 1000,
        maxManagedStorageBytes: 0,
        tempFileMaxAgeMs: 1000
      },
      storage,
      {
        async getCapacity() {
          return { availableBytes: 2500, totalBytes: 10_000 };
        }
      },
      new ManagedStorageInventoryService(storage),
      new StorageReservationManager()
    );

    await expect(
      policy.reserveMany([
        { operation: "encode", requiredBytes: 900 },
        { operation: "encode", requiredBytes: 900 }
      ])
    ).rejects.toMatchObject({ status: 507, code: "INSUFFICIENT_STORAGE" });
    await expect(policy.getStatus()).resolves.toMatchObject({ reservedBytes: 0 });
  });

  it("does not interleave unrelated admissions during a batch reservation", async () => {
    const { root, storage } = await makeStorage();
    const firstCapacity = deferred<{ availableBytes: number; totalBytes: number }>();
    const calls: string[] = [];
    const policy = new StoragePolicyService(
      {
        storageRoot: root,
        minFreeStorageBytes: 1000,
        maxManagedStorageBytes: 0,
        tempFileMaxAgeMs: 1000
      },
      storage,
      {
        async getCapacity() {
          calls.push(`capacity-${calls.length + 1}`);
          if (calls.length === 1) return firstCapacity.promise;
          return { availableBytes: 5000, totalBytes: 10_000 };
        }
      },
      new ManagedStorageInventoryService(storage),
      new StorageReservationManager()
    );

    const pair = policy.reserveMany([
      { operation: "encode", requiredBytes: 600 },
      { operation: "encode", requiredBytes: 600 }
    ]);
    await Promise.resolve();
    const unrelated = policy.reserve({ operation: "poster", requiredBytes: 100 });
    await Promise.resolve();

    expect(calls).toEqual(["capacity-1"]);
    firstCapacity.resolve({ availableBytes: 5000, totalBytes: 10_000 });
    const pairReservations = await pair;
    expect(pairReservations.map((reservation) => reservation.bytes)).toEqual([600, 600]);
    const unrelatedReservation = await unrelated;
    expect(calls).toEqual(["capacity-1", "capacity-2"]);
    expect((await policy.getStatus()).reservedBytes).toBe(1300);

    for (const reservation of pairReservations) reservation.release();
    unrelatedReservation.release();
  });
});
