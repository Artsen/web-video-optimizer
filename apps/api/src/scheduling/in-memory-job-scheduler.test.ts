import { describe, expect, it } from "vitest";
import { InMemoryJobScheduler } from "./in-memory-job-scheduler.js";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("InMemoryJobScheduler", () => {
  it("rejects invalid concurrency and starts empty", () => {
    expect(() => new InMemoryJobScheduler(0)).toThrow("Invalid max media concurrency: 0");
    expect(() => new InMemoryJobScheduler(-1)).toThrow("Invalid max media concurrency: -1");
    expect(() => new InMemoryJobScheduler(1.5)).toThrow("Invalid max media concurrency: 1.5");

    expect(new InMemoryJobScheduler(2).getSnapshot()).toEqual({
      maxConcurrency: 2,
      queuedJobIds: [],
      runningJobIds: []
    });
  });

  it("starts one task immediately and keeps saturated tasks queued in FIFO order", async () => {
    const scheduler = new InMemoryJobScheduler(1);
    const first = deferred();
    const second = deferred();
    const third = deferred();
    const started: string[] = [];

    scheduler.enqueue({
      jobId: "first",
      run: () => {
        started.push("first");
        return first.promise;
      }
    });
    scheduler.enqueue({
      jobId: "second",
      run: () => {
        started.push("second");
        return second.promise;
      }
    });
    scheduler.enqueue({
      jobId: "third",
      run: () => {
        started.push("third");
        return third.promise;
      }
    });

    expect(started).toEqual(["first"]);
    expect(scheduler.getSnapshot()).toEqual({
      maxConcurrency: 1,
      queuedJobIds: ["second", "third"],
      runningJobIds: ["first"]
    });

    first.resolve();
    await flush();
    expect(started).toEqual(["first", "second"]);
    expect(scheduler.getSnapshot().queuedJobIds).toEqual(["third"]);

    second.resolve();
    await flush();
    expect(started).toEqual(["first", "second", "third"]);
    third.resolve();
    await flush();
    expect(scheduler.getSnapshot()).toEqual({
      maxConcurrency: 1,
      queuedJobIds: [],
      runningJobIds: []
    });
  });

  it("allows concurrency greater than one", () => {
    const scheduler = new InMemoryJobScheduler(2);
    const first = deferred();
    const second = deferred();
    const third = deferred();
    const started: string[] = [];

    scheduler.enqueue({
      jobId: "first",
      run: () => {
        started.push("first");
        return first.promise;
      }
    });
    scheduler.enqueue({
      jobId: "second",
      run: () => {
        started.push("second");
        return second.promise;
      }
    });
    scheduler.enqueue({
      jobId: "third",
      run: () => {
        started.push("third");
        return third.promise;
      }
    });

    expect(started).toEqual(["first", "second"]);
    expect(scheduler.getSnapshot()).toEqual({
      maxConcurrency: 2,
      queuedJobIds: ["third"],
      runningJobIds: ["first", "second"]
    });
  });

  it("releases slots after fulfillment, rejection, and synchronous throw", async () => {
    const scheduler = new InMemoryJobScheduler(1);
    const first = deferred();
    const started: string[] = [];
    const handled: string[] = [];

    scheduler.enqueue({
      jobId: "first",
      run: () => {
        started.push("first");
        return first.promise;
      }
    });
    scheduler.enqueue({
      jobId: "second",
      run: () => {
        started.push("second");
        return Promise.reject(new Error("rejected"));
      },
      onUnhandledError: (error) => {
        handled.push(error instanceof Error ? error.message : String(error));
      }
    });
    scheduler.enqueue({
      jobId: "third",
      run: () => {
        started.push("third");
        throw new Error("sync");
      },
      onUnhandledError: (error) => {
        handled.push(error instanceof Error ? error.message : String(error));
      }
    });
    scheduler.enqueue({
      jobId: "fourth",
      run: async () => {
        started.push("fourth");
      }
    });

    first.resolve();
    await flush();
    await flush();

    expect(started).toEqual(["first", "second", "third", "fourth"]);
    expect(handled).toEqual(["rejected", "sync"]);
    expect(scheduler.getSnapshot().runningJobIds).toEqual([]);
  });

  it("cancels queued tasks without canceling running tasks or executing callbacks", async () => {
    const scheduler = new InMemoryJobScheduler(1);
    const first = deferred();
    const started: string[] = [];

    scheduler.enqueue({
      jobId: "first",
      run: () => {
        started.push("first");
        return first.promise;
      }
    });
    scheduler.enqueue({
      jobId: "second",
      run: async () => {
        started.push("second");
      }
    });

    expect(scheduler.cancelQueued("first")).toBe(false);
    expect(scheduler.cancelQueued("second")).toBe(true);
    expect(scheduler.isQueued("second")).toBe(false);
    expect(scheduler.isRunning("first")).toBe(true);

    first.resolve();
    await flush();
    expect(started).toEqual(["first"]);
  });

  it("rejects duplicate job IDs and keeps instances isolated", () => {
    const first = new InMemoryJobScheduler(1);
    const second = new InMemoryJobScheduler(1);
    const deferredTask = deferred();

    first.enqueue({ jobId: "same", run: () => deferredTask.promise });
    expect(() => first.enqueue({ jobId: "same", run: async () => undefined })).toThrow(
      "Job is already scheduled: same"
    );
    second.enqueue({ jobId: "same", run: async () => undefined });

    expect(first.getSnapshot().runningJobIds).toEqual(["same"]);
    expect(second.getSnapshot().runningJobIds).toEqual(["same"]);
  });

  it("returns snapshot copies without exposing mutable internal collections", () => {
    const scheduler = new InMemoryJobScheduler(1);
    const task = deferred();

    scheduler.enqueue({ jobId: "running", run: () => task.promise });
    scheduler.enqueue({ jobId: "queued", run: async () => undefined });

    const snapshot = scheduler.getSnapshot();
    snapshot.runningJobIds.push("fake-running");
    snapshot.queuedJobIds.push("fake-queued");

    expect(scheduler.getSnapshot()).toEqual({
      maxConcurrency: 1,
      queuedJobIds: ["queued"],
      runningJobIds: ["running"]
    });
  });
});
