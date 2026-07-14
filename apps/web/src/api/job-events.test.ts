import { describe, expect, it, vi } from "vitest";
import { createBrowserJobEvents } from "./job-events";
import { job } from "../testing/fixtures";

class FakeEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {}

  emit(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) } as MessageEvent);
  }

  fail() {
    this.onerror?.();
  }
}

describe("job event adapter", () => {
  it("subscribes to the job event URL and forwards updates", () => {
    const sources: FakeEventSource[] = [];
    const events = createBrowserJobEvents({
      baseUrl: "http://localhost:4000",
      eventSourceFactory: (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source as unknown as EventSource;
      }
    });
    const onUpdate = vi.fn();

    events.subscribe("job-1", { onUpdate, onError: vi.fn() });
    sources[0].emit(job({ status: "running", progress: 40 }));

    expect(sources[0].url).toBe("http://localhost:4000/api/jobs/job-1/events");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "running", progress: 40 }));
  });

  it("closes on terminal updates, invalid payloads, errors, and manual close", () => {
    const sources: FakeEventSource[] = [];
    const events = createBrowserJobEvents({
      baseUrl: "http://localhost:4000",
      eventSourceFactory: (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source as unknown as EventSource;
      }
    });
    const onError = vi.fn();

    events.subscribe("completed", { onUpdate: vi.fn(), onError });
    sources[0].emit(job({ id: "completed", status: "completed" }));
    expect(sources[0].close).toHaveBeenCalledTimes(1);

    events.subscribe("invalid", { onUpdate: vi.fn(), onError });
    sources[1].emit("{not-json");
    expect(sources[1].close).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    events.subscribe("error", { onUpdate: vi.fn(), onError });
    sources[2].fail();
    expect(sources[2].close).toHaveBeenCalledTimes(1);

    const subscription = events.subscribe("manual", { onUpdate: vi.fn(), onError });
    subscription.close();
    sources[3].emit(job({ id: "manual", status: "running" }));
    expect(sources[3].close).toHaveBeenCalledTimes(1);
  });

  it("replaces duplicate subscriptions for the same job", () => {
    const sources: FakeEventSource[] = [];
    const events = createBrowserJobEvents({
      baseUrl: "http://localhost:4000",
      eventSourceFactory: (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source as unknown as EventSource;
      }
    });

    events.subscribe("job-1", { onUpdate: vi.fn(), onError: vi.fn() });
    events.subscribe("job-1", { onUpdate: vi.fn(), onError: vi.fn() });

    expect(sources[0].close).toHaveBeenCalledTimes(1);
    expect(sources[1].close).not.toHaveBeenCalled();
  });
});
