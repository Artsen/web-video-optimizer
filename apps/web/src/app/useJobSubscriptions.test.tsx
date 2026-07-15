import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { JobDto } from "@local-video-optimizer/contracts";
import type { JobEvents, JobEventSubscription } from "../api/job-events";
import { job as makeJob } from "../testing/fixtures";
import { useJobSubscriptions } from "./useJobSubscriptions";

type StoredSubscription = JobEventSubscription & {
  emit(job: JobDto): void;
  fail(): void;
  closeCalls: number;
};

function createFakeJobEvents() {
  const subscriptions = new Map<string, StoredSubscription>();
  const events: JobEvents = {
    subscribe(jobId, handlers) {
      const subscription: StoredSubscription = {
        closeCalls: 0,
        close() {
          subscription.closeCalls += 1;
          if (subscriptions.get(jobId) === subscription) subscriptions.delete(jobId);
        },
        emit(job) {
          handlers.onUpdate(job);
        },
        fail() {
          handlers.onError();
        }
      };
      subscriptions.set(jobId, subscription);
      return subscription;
    }
  };
  return { events, subscriptions };
}

describe("useJobSubscriptions", () => {
  it("replaces an existing subscription for the same job", () => {
    const fake = createFakeJobEvents();
    const previous = makeJob({ id: "job-1" });
    const { result } = renderHook(() =>
      useJobSubscriptions({ jobEvents: fake.events, onUpdate: vi.fn(), onTerminal: vi.fn(), onError: vi.fn() })
    );

    result.current.subscribe(previous);
    const first = fake.subscriptions.get(previous.id);
    result.current.subscribe(previous);

    expect(first?.closeCalls).toBe(1);
    expect(fake.subscriptions.get(previous.id)).not.toBe(first);
  });

  it("closes terminal subscriptions and forwards updates", () => {
    const fake = createFakeJobEvents();
    const onUpdate = vi.fn();
    const onTerminal = vi.fn();
    const { result } = renderHook(() =>
      useJobSubscriptions({ jobEvents: fake.events, onUpdate, onTerminal, onError: vi.fn() })
    );

    result.current.subscribe(makeJob({ id: "job-1", status: "running" }));
    fake.subscriptions.get("job-1")?.emit(makeJob({ id: "job-1", status: "completed" }));

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1", status: "completed" }));
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(fake.subscriptions.has("job-1")).toBe(false);
  });

  it("closes failed subscriptions and all subscriptions on unmount", () => {
    const fake = createFakeJobEvents();
    const onError = vi.fn();
    const { result, unmount } = renderHook(() =>
      useJobSubscriptions({ jobEvents: fake.events, onUpdate: vi.fn(), onTerminal: vi.fn(), onError })
    );

    result.current.subscribe(makeJob({ id: "job-1" }));
    fake.subscriptions.get("job-1")?.fail();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(fake.subscriptions.has("job-1")).toBe(false);

    result.current.subscribe(makeJob({ id: "job-2" }));
    const second = fake.subscriptions.get("job-2");
    unmount();
    expect(second?.closeCalls).toBe(1);
    expect(fake.subscriptions.size).toBe(0);
  });
});
