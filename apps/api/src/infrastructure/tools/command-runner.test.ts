import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeProcessRunner } from "../processes/test/fake-process-runner.js";
import { createCommandRunner } from "./command-runner.js";

const policy = {
  timeoutMs: 100,
  terminationGracePeriodMs: 25,
  maxCapturedOutputBytes: 8
};

describe("CommandRunner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("captures normal stdout and bounded stderr on nonzero close", async () => {
    const processRunner = new FakeProcessRunner();
    const commandRunner = createCommandRunner(processRunner, policy);
    const result = commandRunner.run("tool", ["--arg"]);

    processRunner.latest().emitStdout("ok");
    processRunner.latest().emitStderr("123456789tail");
    processRunner.latest().emitClose(2);

    await expect(result).resolves.toEqual({ stdout: "ok", stderr: "6789tail", code: 2 });
  });

  it("rejects spawn errors and clears normal completion paths", async () => {
    const processRunner = new FakeProcessRunner();
    const result = createCommandRunner(processRunner, policy).run("missing", []);

    processRunner.latest().emitError(new Error("ENOENT"));
    processRunner.latest().emitClose(0);

    await expect(result).rejects.toThrow("ENOENT");
  });

  it("times out, gracefully terminates, and force terminates when needed", async () => {
    const gracefulRunner = new FakeProcessRunner();
    const graceful = createCommandRunner(gracefulRunner, policy).run("ffprobe", []);
    graceful.catch(() => {});
    await vi.advanceTimersByTimeAsync(100);
    expect(gracefulRunner.latest().killSignals).toEqual(["SIGTERM"]);
    gracefulRunner.latest().emitClose(null);
    await expect(graceful).rejects.toThrow("ffprobe timed out after 100 ms");

    const forcedRunner = new FakeProcessRunner();
    const forced = createCommandRunner(forcedRunner, policy).run("ffprobe", []);
    forced.catch(() => {});
    await vi.advanceTimersByTimeAsync(150);
    expect(forcedRunner.latest().killSignals).toEqual(["SIGTERM", "SIGKILL"]);
    await expect(forced).rejects.toThrow("ffprobe timed out after 100 ms");
  });

  it("rejects full stdout overflow and does not parse truncated JSON", async () => {
    const processRunner = new FakeProcessRunner();
    const result = createCommandRunner(processRunner, policy).runJson("ffprobe", []);

    processRunner.latest().emitStdout('{"too":"long"}');
    processRunner.latest().emitClose(0);

    await expect(result).rejects.toThrow("Process output exceeded 8 bytes");
    expect(processRunner.latest().killSignals).toEqual(["SIGTERM"]);
  });

  it("parses JSON success and rejects invalid JSON", async () => {
    const successRunner = new FakeProcessRunner();
    const success = createCommandRunner(successRunner, policy).runJson("ffprobe", []);
    successRunner.latest().emitStdout("{}");
    successRunner.latest().emitClose(0);
    await expect(success).resolves.toEqual({});

    const invalidRunner = new FakeProcessRunner();
    const invalid = createCommandRunner(invalidRunner, policy).runJson("ffprobe", []);
    invalidRunner.latest().emitStdout("no");
    invalidRunner.latest().emitClose(0);
    await expect(invalid).rejects.toThrow();
  });

  it("keeps command existence semantics bounded", async () => {
    const normalRunner = new FakeProcessRunner();
    const normal = createCommandRunner(normalRunner, policy).commandExists("tool");
    normalRunner.latest().emitClose(99);
    await expect(normal).resolves.toBe(true);

    const missingRunner = new FakeProcessRunner();
    const missing = createCommandRunner(missingRunner, policy).commandExists("tool");
    missingRunner.latest().emitError(new Error("missing"));
    await expect(missing).resolves.toBe(false);

    const timeoutRunner = new FakeProcessRunner();
    const timeout = createCommandRunner(timeoutRunner, policy).commandExists("tool");
    await vi.advanceTimersByTimeAsync(150);
    await expect(timeout).resolves.toBe(false);
  });
});
