import type { JobDto } from "@local-video-optimizer/contracts";
import { JobDtoSchema } from "@local-video-optimizer/contracts";
import { jobEventsUrl } from "./urls";

export interface JobEventSubscription {
  close(): void;
}

export interface JobEvents {
  subscribe(
    jobId: string,
    handlers: {
      onUpdate(job: JobDto): void;
      onError(): void;
    }
  ): JobEventSubscription;
}

type EventSourceFactory = (url: string) => EventSource;

const terminalStatuses = new Set<JobDto["status"]>(["completed", "failed", "canceled"]);

export function createBrowserJobEvents({
  baseUrl,
  eventSourceFactory = (url) => new EventSource(url)
}: {
  baseUrl: string;
  eventSourceFactory?: EventSourceFactory;
}): JobEvents {
  const active = new Map<string, JobEventSubscription>();

  return {
    subscribe(jobId, handlers) {
      active.get(jobId)?.close();

      const events = eventSourceFactory(jobEventsUrl(baseUrl, jobId));
      let closed = false;
      const subscription: JobEventSubscription = {
        close() {
          if (closed) return;
          closed = true;
          events.close();
          if (active.get(jobId) === subscription) active.delete(jobId);
        }
      };

      active.set(jobId, subscription);

      events.onmessage = (event) => {
        if (closed) return;
        let data: unknown;
        try {
          data = JSON.parse(event.data as string);
        } catch {
          subscription.close();
          handlers.onError();
          return;
        }
        const parsed = JobDtoSchema.safeParse(data);
        if (!parsed.success) {
          subscription.close();
          handlers.onError();
          return;
        }
        handlers.onUpdate(parsed.data);
        if (terminalStatuses.has(parsed.data.status)) subscription.close();
      };

      events.onerror = () => {
        subscription.close();
        handlers.onError();
      };

      return subscription;
    }
  };
}
