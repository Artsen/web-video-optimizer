import http from "node:http";
import { EventEmitter } from "node:events";
import type express from "express";
import type { ApiRuntime } from "./runtime/api-runtime.js";

export type ShutdownRuntime = ApiRuntime & {
  shutdown?: () => Promise<void>;
};

export type ProcessSignalName = "SIGINT" | "SIGTERM";

export type ProcessLike = {
  once(signal: ProcessSignalName, listener: () => void): void;
  off(signal: ProcessSignalName, listener: () => void): void;
  exitCode?: number;
};

export type ServerLifecycle = {
  server: http.Server;
  shutdown(): Promise<void>;
};

export type ServerLike = EventEmitter & {
  listen(port: number, host: string, callback: () => void): unknown;
  close(callback: (error?: Error) => void): unknown;
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
};

export function createServerLifecycle(dependencies: {
  server: ServerLike;
  runtime: ShutdownRuntime;
  processLike?: ProcessLike;
  log?: Pick<Console, "error">;
}): ServerLifecycle {
  const processLike = dependencies.processLike ?? process;
  const log = dependencies.log ?? console;
  let shutdownPromise: Promise<void> | undefined;

  const closeServer = () =>
    new Promise<void>((resolve, reject) => {
      dependencies.server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
      dependencies.server.closeIdleConnections?.();
    });

  const shutdown = () => {
    shutdownPromise ??= (async () => {
      try {
        await Promise.all([closeServer(), dependencies.runtime.shutdown?.() ?? Promise.resolve()]);
        dependencies.server.closeAllConnections?.();
        processLike.off("SIGINT", onSigint);
        processLike.off("SIGTERM", onSigterm);
      } catch (error) {
        processLike.exitCode = 1;
        log.error("Graceful shutdown failed:", error);
        throw error;
      }
    })();
    return shutdownPromise;
  };

  const onSigint = () => {
    void shutdown();
  };
  const onSigterm = () => {
    void shutdown();
  };

  processLike.once("SIGINT", onSigint);
  processLike.once("SIGTERM", onSigterm);

  return { server: dependencies.server as http.Server, shutdown };
}

export async function startServerLifecycle(dependencies: {
  app: express.Express;
  runtime: ShutdownRuntime;
  host: string;
  port: number;
  processLike?: ProcessLike;
  log?: Pick<Console, "log" | "error">;
}): Promise<ServerLifecycle> {
  const server = http.createServer(dependencies.app);
  const log = dependencies.log ?? console;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(dependencies.port, dependencies.host, () => {
      server.off("error", reject);
      log.log(`Local Video Optimizer API listening on http://${dependencies.host}:${dependencies.port}`);
      resolve();
    });
  });

  return createServerLifecycle({
    server,
    runtime: dependencies.runtime,
    processLike: dependencies.processLike,
    log
  });
}
