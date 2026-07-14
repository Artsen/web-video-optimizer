import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeProcessRunner } from "./test/fake-process-runner.js";
import { superviseProcess } from "./process-supervisor.js";

const policy = {
  timeoutMs: 100,
  terminationGracePeriodMs: 25,
  maxCapturedOutputBytes: 1024
};

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("superviseProcess", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("settles on close before timeout and ignores later errors", async () => {
    const runner = new FakeProcessRunner();
    const process = runner.spawn("ffmpeg", []);
    const supervised = superviseProcess(process, "ffmpeg", policy);

    process.emitClose(0);
    process.emitError(new Error("late"));

    await expect(supervised.promise).resolves.toEqual({ kind: "close", code: 0 });
    expect(process.killSignals).toEqual([]);
  });

  it("settles on error before timeout and ignores later close", async () => {
    const runner = new FakeProcessRunner();
    const process = runner.spawn("ffmpeg", []);
    const supervised = superviseProcess(process, "ffmpeg", policy);

    process.emitError(new Error("spawn failed"));
    process.emitClose(0);

    await expect(supervised.promise).resolves.toMatchObject({ kind: "error", error: expect.any(Error) });
  });

  it("sends SIGTERM on timeout and treats close after SIGTERM as timeout", async () => {
    const runner = new FakeProcessRunner();
    const process = runner.spawn("ffmpeg", []);
    const supervised = superviseProcess(process, "ffmpeg", policy);

    await vi.advanceTimersByTimeAsync(100);
    expect(process.killSignals).toEqual(["SIGTERM"]);
    process.emitClose(null);

    await expect(supervised.promise).resolves.toMatchObject({
      kind: "timeout",
      error: expect.objectContaining({ message: "ffmpeg timed out after 100 ms" }),
      forced: false
    });
  });

  it("sends SIGKILL after the grace period and force-settles if no close arrives", async () => {
    const onForceSettle = vi.fn();
    const runner = new FakeProcessRunner();
    const process = runner.spawn("ffmpeg", []);
    const supervised = superviseProcess(process, "ffmpeg", policy, { onForceSettle });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(25);
    expect(process.killSignals).toEqual(["SIGTERM", "SIGKILL"]);
    await vi.advanceTimersByTimeAsync(25);

    await expect(supervised.promise).resolves.toMatchObject({ kind: "timeout", forced: true });
    expect(onForceSettle).toHaveBeenCalledTimes(1);
  });

  it("keeps multiple concurrent processes on independent deadlines", async () => {
    const runner = new FakeProcessRunner();
    const first = runner.spawn("ffmpeg", []);
    const second = runner.spawn("ffmpeg", []);
    const supervisedFirst = superviseProcess(first, "ffmpeg", policy);
    const supervisedSecond = superviseProcess(second, "ffmpeg", { ...policy, timeoutMs: 200 });

    await vi.advanceTimersByTimeAsync(100);
    expect(first.killSignals).toEqual(["SIGTERM"]);
    expect(second.killSignals).toEqual([]);

    second.emitClose(0);
    first.emitClose(null);
    await flush();

    await expect(supervisedFirst.promise).resolves.toMatchObject({ kind: "timeout" });
    await expect(supervisedSecond.promise).resolves.toEqual({ kind: "close", code: 0 });
  });
});
