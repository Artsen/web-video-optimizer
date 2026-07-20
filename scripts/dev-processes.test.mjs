import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createDevPlan, npmExecutable, runDevLauncher, terminateProcessTree } from "./dev-processes.mjs";

class FakeChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.killed = false;
  }

  kill(signal) {
    this.killed = signal;
  }
}

function createSpawnHarness() {
  const calls = [];
  const children = [];
  const spawnProcess = vi.fn((command, args, options) => {
    const child = new FakeChild(1000 + children.length);
    children.push(child);
    calls.push({ command, args, options, child });
    return child;
  });
  return { calls, children, spawnProcess };
}

describe("development launcher process plan", () => {
  it("selects npm.cmd on Windows", () => {
    expect(npmExecutable("win32")).toBe("npm.cmd");
    expect(npmExecutable("linux")).toBe("npm");
  });

  it("builds shared packages before starting both development servers", async () => {
    const harness = createSpawnHarness();
    const signals = new EventEmitter();
    const promise = runDevLauncher({
      spawnProcess: harness.spawnProcess,
      logger: { log: vi.fn(), error: vi.fn() },
      platform: "linux",
      signalSource: signals
    });

    expect(harness.calls[0]).toMatchObject({ command: "npm", args: ["run", "build:packages"] });
    harness.children[0].emit("exit", 0);
    await Promise.resolve();
    expect(harness.calls.slice(1).map((call) => call.args)).toEqual([
      ["run", "dev", "--workspace", "apps/api"],
      ["run", "dev", "--workspace", "apps/web"]
    ]);
    signals.emit("SIGINT");
    expect(harness.children[1].killed).toBe("SIGTERM");
    expect(harness.children[2].killed).toBe("SIGTERM");
    harness.children[1].emit("exit", 0);
    harness.children[2].emit("exit", 0);
    await expect(promise).resolves.toBe(0);
  });

  it("returns nonzero when the shared package build fails", async () => {
    const harness = createSpawnHarness();
    const promise = runDevLauncher({
      spawnProcess: harness.spawnProcess,
      logger: { log: vi.fn(), error: vi.fn() },
      platform: "linux"
    });

    harness.children[0].emit("exit", 1);

    await expect(promise).resolves.toBe(1);
    expect(harness.calls).toHaveLength(1);
  });

  it("terminates the sibling when one development child fails", async () => {
    const harness = createSpawnHarness();
    const signals = new EventEmitter();
    const promise = runDevLauncher({
      spawnProcess: harness.spawnProcess,
      logger: { log: vi.fn(), error: vi.fn() },
      platform: "linux",
      signalSource: signals
    });
    harness.children[0].emit("exit", 0);
    await Promise.resolve();

    harness.children[1].emit("exit", 9);
    await Promise.resolve();

    expect(harness.children[2].killed).toBe("SIGTERM");
    harness.children[2].emit("exit", null, "SIGTERM");
    await expect(promise).resolves.toBe(9);
  });

  it("uses taskkill for Windows process trees", () => {
    const child = new FakeChild(1234);
    const taskkill = vi.fn(() => new FakeChild(9999));
    terminateProcessTree(child, { platform: "win32", spawnProcess: taskkill });
    expect(child.killed).toBe(false);
    expect(taskkill).toHaveBeenCalledWith("taskkill", ["/pid", "1234", "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
  });

  it("retries with piped output when inherited Windows stdio is unavailable", async () => {
    const harness = createSpawnHarness();
    const error = new Error("invalid inherited stdio");
    error.code = "EINVAL";
    harness.spawnProcess.mockImplementationOnce(() => {
      throw error;
    });

    const promise = runDevLauncher({
      spawnProcess: harness.spawnProcess,
      logger: { log: vi.fn(), error: vi.fn() },
      platform: "win32",
      nodeExecutable: "node.exe",
      npmExecPath: "npm-cli.js",
      stdout: { write: vi.fn() },
      stderr: { write: vi.fn() }
    });

    expect(harness.calls[0]).toMatchObject({
      command: "node.exe",
      args: ["npm-cli.js", "run", "build:packages"],
      options: { shell: false, stdio: ["ignore", "pipe", "pipe"] }
    });
    harness.children[0].emit("exit", 1);

    await expect(promise).resolves.toBe(1);
  });

  it("describes the intended development plan", () => {
    expect(createDevPlan({ platform: "win32" }).children.map((child) => child.command)).toEqual(["npm.cmd", "npm.cmd"]);
  });
});
