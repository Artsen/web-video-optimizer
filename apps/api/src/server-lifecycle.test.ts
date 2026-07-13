import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { ApiRuntime } from "./runtime/api-runtime.js";
import { createServerLifecycle, type ProcessLike, type ServerLike } from "./server-lifecycle.js";

class FakeServer extends EventEmitter implements ServerLike {
  closeCalls = 0;
  closeIdleCalls = 0;
  closeAllCalls = 0;

  listen(_port: number, _host: string, callback: () => void): void {
    callback();
  }

  close(callback: (error?: Error) => void): void {
    this.closeCalls += 1;
    callback();
  }

  closeIdleConnections(): void {
    this.closeIdleCalls += 1;
  }

  closeAllConnections(): void {
    this.closeAllCalls += 1;
  }
}

function runtime(overrides: Partial<ApiRuntime & { shutdown: () => Promise<void> }> = {}) {
  return {
    initialize: async () => undefined,
    shutdown: async () => undefined,
    ...overrides
  } as ApiRuntime & { shutdown: () => Promise<void> };
}

describe("server lifecycle", () => {
  it("handles duplicate signals with one shutdown path and closes server connections", async () => {
    const server = new FakeServer();
    const processLike = new EventEmitter() as EventEmitter & ProcessLike;
    const shutdown = vi.fn(async () => undefined);
    const lifecycle = createServerLifecycle({ server, runtime: runtime({ shutdown }), processLike });

    processLike.emit("SIGINT");
    processLike.emit("SIGTERM");
    await lifecycle.shutdown();

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(server.closeCalls).toBe(1);
    expect(server.closeIdleCalls).toBe(1);
    expect(server.closeAllCalls).toBe(1);
  });

  it("sets a nonzero exit code and reports shutdown failure", async () => {
    const server = new FakeServer();
    const processLike = new EventEmitter() as EventEmitter & ProcessLike;
    const error = new Error("nope");
    const log = { error: vi.fn() };
    const lifecycle = createServerLifecycle({
      server,
      runtime: runtime({ shutdown: async () => Promise.reject(error) }),
      processLike,
      log
    });

    await expect(lifecycle.shutdown()).rejects.toThrow("nope");

    expect(processLike.exitCode).toBe(1);
    expect(log.error).toHaveBeenCalledWith("Graceful shutdown failed:", error);
  });
});
