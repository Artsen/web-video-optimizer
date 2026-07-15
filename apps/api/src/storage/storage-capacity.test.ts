import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isNoSpaceError, NodeStatfsCapacityProvider } from "./storage-capacity.js";

describe("NodeStatfsCapacityProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts bigint statfs values into safe byte counts", async () => {
    vi.spyOn(fs, "statfs").mockResolvedValue({
      bavail: 5n,
      bsize: 1024n,
      blocks: 10n
    } as Awaited<ReturnType<typeof fs.statfs>>);

    await expect(new NodeStatfsCapacityProvider().getCapacity("data")).resolves.toEqual({
      availableBytes: 5120,
      totalBytes: 10240
    });
  });

  it("rejects unsafe capacity values", async () => {
    vi.spyOn(fs, "statfs").mockResolvedValue({
      bavail: BigInt(Number.MAX_SAFE_INTEGER),
      bsize: 1024n,
      blocks: 10n
    } as Awaited<ReturnType<typeof fs.statfs>>);

    await expect(new NodeStatfsCapacityProvider().getCapacity("data")).rejects.toThrow(
      "Available capacity is too large"
    );
  });
});

describe("isNoSpaceError", () => {
  it("detects ENOSPC and common no-space text", () => {
    expect(isNoSpaceError({ code: "ENOSPC" })).toBe(true);
    expect(isNoSpaceError(new Error("No space left on device"))).toBe(true);
    expect(isNoSpaceError(new Error("permission denied"))).toBe(false);
  });
});
