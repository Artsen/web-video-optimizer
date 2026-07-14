import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { BoundedTextBuffer } from "../../infrastructure/processes/bounded-text-buffer.js";

export type CompiledApiHarness = {
  baseUrl: string;
  stdoutTail(): string;
  stderrTail(): string;
  stop(signal?: NodeJS.Signals): Promise<void>;
  kill(): Promise<void>;
};

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate integration port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

export async function startCompiledApi(options: {
  repoRoot: string;
  storageRoot: string;
  env?: Record<string, string>;
}): Promise<CompiledApiHarness> {
  const port = await freePort();
  const stdout = new BoundedTextBuffer(128 * 1024, "tail");
  const stderr = new BoundedTextBuffer(128 * 1024, "tail");
  const child = spawn(process.execPath, [path.join(options.repoRoot, "apps/api/dist/server.js")], {
    cwd: options.repoRoot,
    windowsHide: true,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      STORAGE_ROOT: options.storageRoot,
      ...options.env
    }
  });
  child.stdout?.on("data", (chunk) => stdout.append(chunk));
  child.stderr?.on("data", (chunk) => stderr.append(chunk));

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, child, stdout, stderr);

  return {
    baseUrl,
    stdoutTail: () => stdout.toString(),
    stderrTail: () => stderr.toString(),
    stop: (signal: NodeJS.Signals = "SIGTERM") => stopProcess(child, signal),
    kill: () => stopProcess(child, "SIGKILL")
  };
}

async function waitForHealth(
  baseUrl: string,
  child: ChildProcess,
  stdout: BoundedTextBuffer,
  stderr: BoundedTextBuffer
): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API exited before health check\nstdout:\n${stdout.toString()}\nstderr:\n${stderr.toString()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200) return;
    } catch {
      // keep polling until the deadline
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`API health check timed out\nstdout:\n${stdout.toString()}\nstderr:\n${stderr.toString()}`);
}

async function stopProcess(child: ChildProcess, signal: NodeJS.Signals): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill(signal);
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
