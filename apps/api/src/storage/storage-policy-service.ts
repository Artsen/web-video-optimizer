import type { StorageCleanupResultDto, StorageStatusDto } from "@local-video-optimizer/contracts";
import type { ApiConfig } from "../config.js";
import type { StorageBoundary } from "./storage-boundary.js";
import type { StorageCapacityProvider } from "./storage-capacity.js";
import { insufficientStorageForOperation } from "./storage-capacity.js";
import type { ManagedStorageInventoryService, StaleTemporaryEntry } from "./managed-storage-inventory.js";
import type { StorageReservation, StorageReservationManager } from "./storage-reservations.js";

export type StorageOperation = "upload" | "encode" | "sample" | "poster" | "subtitle" | "mux" | "package" | "import";

export type AllocationRequest = {
  operation: StorageOperation;
  requiredBytes: number;
};

export class StoragePolicyService {
  #admission = Promise.resolve();

  constructor(
    private readonly config: Pick<
      ApiConfig,
      "storageRoot" | "minFreeStorageBytes" | "maxManagedStorageBytes" | "tempFileMaxAgeMs"
    >,
    private readonly storage: StorageBoundary,
    private readonly capacityProvider: StorageCapacityProvider,
    private readonly inventory: ManagedStorageInventoryService,
    private readonly reservations: StorageReservationManager
  ) {}

  async getStatus(): Promise<StorageStatusDto> {
    const [capacity, inventory] = await Promise.all([
      this.capacityProvider.getCapacity(this.config.storageRoot),
      this.inventory.measure(this.config.tempFileMaxAgeMs)
    ]);
    const reservedBytes = this.reservations.reservedBytes;
    const managedBytes = inventory.managedBytes + reservedBytes;
    const effectiveAvailableBytes = capacity.availableBytes - reservedBytes;
    return {
      managedBytes,
      reservedBytes,
      availableBytes: capacity.availableBytes,
      ...(capacity.totalBytes === undefined ? {} : { totalFilesystemBytes: capacity.totalBytes }),
      ...(this.config.maxManagedStorageBytes > 0 ? { configuredMaxBytes: this.config.maxManagedStorageBytes } : {}),
      minimumFreeBytes: this.config.minFreeStorageBytes,
      pressure: this.pressure(effectiveAvailableBytes, managedBytes),
      areas: inventory.areas,
      cleanup: {
        staleTemporaryBytes: inventory.staleTemporary.bytes,
        staleTemporaryFileCount: inventory.staleTemporary.fileCount
      }
    };
  }

  async assertCanAllocate(request: AllocationRequest): Promise<void> {
    const reservation = await this.reserve(request);
    reservation.release();
  }

  async reserve(request: AllocationRequest): Promise<StorageReservation> {
    return this.withAdmission(async () => {
      const requiredBytes = normalizeRequiredBytes(request.requiredBytes);
      const status = await this.getStatus();
      const projectedAvailable =
        status.availableBytes === undefined ? undefined : status.availableBytes - status.reservedBytes - requiredBytes;
      if (projectedAvailable !== undefined && projectedAvailable <= status.minimumFreeBytes) {
        throw insufficientStorageForOperation(request.operation);
      }
      if (status.configuredMaxBytes !== undefined && status.managedBytes + requiredBytes >= status.configuredMaxBytes) {
        throw insufficientStorageForOperation(request.operation);
      }
      return this.reservations.reserve(requiredBytes);
    });
  }

  async getSafeUploadLimit(configuredLimitBytes: number): Promise<number> {
    const status = await this.getStatus();
    const availableAllowance = Math.max(
      0,
      (status.availableBytes ?? 0) - status.reservedBytes - status.minimumFreeBytes - 1_048_576
    );
    const quotaAllowance =
      status.configuredMaxBytes === undefined
        ? configuredLimitBytes
        : Math.max(0, status.configuredMaxBytes - status.managedBytes);
    return Math.min(configuredLimitBytes, availableAllowance, quotaAllowance);
  }

  async cleanupStaleTemporaryFiles(): Promise<StorageCleanupResultDto> {
    const inventory = await this.inventory.measure(this.config.tempFileMaxAgeMs);
    let removedBytes = 0;
    let removedFileCount = 0;
    for (const entry of inventory.staleEntries) {
      const removed = await this.removeStaleEntry(entry);
      if (removed) {
        removedBytes += entry.bytes;
        removedFileCount += 1;
      }
    }
    return {
      removedBytes,
      removedFileCount,
      storage: await this.getStatus()
    };
  }

  private pressure(availableBytes: number, managedBytes: number): StorageStatusDto["pressure"] {
    if (availableBytes <= this.config.minFreeStorageBytes) return "critical";
    if (this.config.maxManagedStorageBytes > 0 && managedBytes >= this.config.maxManagedStorageBytes) return "critical";
    if (availableBytes <= this.config.minFreeStorageBytes * 2) return "warning";
    if (this.config.maxManagedStorageBytes > 0 && managedBytes >= this.config.maxManagedStorageBytes * 0.8)
      return "warning";
    return "normal";
  }

  private async removeStaleEntry(entry: StaleTemporaryEntry): Promise<boolean> {
    try {
      await this.storage.removeFile(entry.area, entry.path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      console.warn("Unable to remove stale temporary storage entry:", error);
      return false;
    }
  }

  private async withAdmission<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#admission;
    let releaseAdmission!: () => void;
    this.#admission = new Promise((resolve) => {
      releaseAdmission = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      releaseAdmission();
    }
  }
}

function normalizeRequiredBytes(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes < 0) throw new Error("Invalid storage allocation size");
  return Math.ceil(bytes);
}
