import fs from "node:fs/promises";
import { ApiError } from "../errors/api-error.js";

export type FilesystemCapacity = {
  availableBytes: number;
  totalBytes?: number;
};

export interface StorageCapacityProvider {
  getCapacity(path: string): Promise<FilesystemCapacity>;
}

export class StorageCapacityError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "StorageCapacityError";
  }
}

export class InsufficientStorageError extends ApiError {
  constructor(message: string) {
    super(507, "INSUFFICIENT_STORAGE", message);
  }
}

function safeBytes(value: bigint, label: string): number {
  if (value < 0n) throw new StorageCapacityError(`${label} was negative`);
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new StorageCapacityError(`${label} is too large to represent safely`);
  return Number(value);
}

export class NodeStatfsCapacityProvider implements StorageCapacityProvider {
  async getCapacity(path: string): Promise<FilesystemCapacity> {
    try {
      const stats = await fs.statfs(path, { bigint: true });
      const availableBytes = safeBytes(stats.bavail * stats.bsize, "Available capacity");
      const totalBytes = safeBytes(stats.blocks * stats.bsize, "Total capacity");
      return { availableBytes, totalBytes };
    } catch (error) {
      if (error instanceof StorageCapacityError) throw error;
      throw new StorageCapacityError("Unable to determine filesystem capacity", error);
    }
  }
}

export function isNoSpaceError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return String(error).toLowerCase().includes("no space left");
  }
  const maybe = error as { code?: unknown; message?: unknown; stderr?: unknown };
  if (maybe.code === "ENOSPC") return true;
  const text = `${String(maybe.message ?? "")}\n${String(maybe.stderr ?? "")}`.toLowerCase();
  return text.includes("no space left") || text.includes("enospc") || text.includes("disk full");
}

export function insufficientStorageForOperation(operation: string): InsufficientStorageError {
  const messages: Record<string, string> = {
    upload: "The machine does not currently have enough free storage for this upload.",
    encode: "Not enough free storage space to start this optimization.",
    sample: "Not enough free storage space to create this sample.",
    poster: "Not enough free storage space to create this poster.",
    subtitle: "Not enough free storage space to generate subtitles.",
    mux: "Not enough free storage space to embed subtitles.",
    package: "Not enough free storage space to create this website package.",
    import: "Not enough free storage space to import this video."
  };
  return new InsufficientStorageError(messages[operation] ?? "Not enough free storage space to complete this request.");
}
