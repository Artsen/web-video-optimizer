export interface StorageReservation {
  readonly bytes: number;
  release(): void;
}

export class StorageReservationManager {
  #reservedBytes = 0;
  #closed = false;

  get reservedBytes(): number {
    return this.#reservedBytes;
  }

  reserve(bytes: number): StorageReservation {
    if (this.#closed) throw new Error("Storage reservations are closed");
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Invalid storage reservation size");
    this.#reservedBytes += bytes;
    let released = false;
    return {
      bytes,
      release: () => {
        if (released) return;
        released = true;
        this.#reservedBytes = Math.max(0, this.#reservedBytes - bytes);
      }
    };
  }

  close(): void {
    this.#closed = true;
    this.#reservedBytes = 0;
  }
}
