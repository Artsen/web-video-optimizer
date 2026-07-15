import { describe, expect, it } from "vitest";
import { StorageReservationManager } from "./storage-reservations.js";

describe("StorageReservationManager", () => {
  it("tracks concurrent reservations and releases them idempotently", async () => {
    const manager = new StorageReservationManager();

    const first = await manager.reserve(100);
    const second = await manager.reserve(250);

    expect(manager.reservedBytes).toBe(350);
    first.release();
    first.release();
    expect(manager.reservedBytes).toBe(250);
    second.release();
    expect(manager.reservedBytes).toBe(0);
  });

  it("rejects invalid reservation sizes and clears runtime reservations on close", async () => {
    const manager = new StorageReservationManager();

    expect(() => manager.reserve(-1)).toThrow("Invalid storage reservation size");
    expect(() => manager.reserve(Number.MAX_SAFE_INTEGER + 1)).toThrow("Invalid storage reservation size");
    await manager.reserve(500);
    manager.close();

    expect(manager.reservedBytes).toBe(0);
  });
});
