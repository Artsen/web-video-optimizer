import React from "react";
import type { JobDto } from "@local-video-optimizer/contracts";
import type { JobEvents, JobEventSubscription } from "../api/job-events";

const terminalStatuses = new Set<JobDto["status"]>(["completed", "failed", "canceled"]);

export function useJobSubscriptions({
  jobEvents,
  onUpdate,
  onTerminal,
  onError
}: {
  jobEvents: JobEvents;
  onUpdate(job: JobDto): void;
  onTerminal?(): void;
  onError?(): void;
}) {
  const subscriptionsRef = React.useRef(new Map<string, JobEventSubscription>());
  const onUpdateRef = React.useRef(onUpdate);
  const onTerminalRef = React.useRef(onTerminal);
  const onErrorRef = React.useRef(onError);

  React.useEffect(() => {
    onUpdateRef.current = onUpdate;
    onTerminalRef.current = onTerminal;
    onErrorRef.current = onError;
  }, [onError, onTerminal, onUpdate]);

  const close = React.useCallback((jobId: string) => {
    subscriptionsRef.current.get(jobId)?.close();
    subscriptionsRef.current.delete(jobId);
  }, []);

  const closeAll = React.useCallback(() => {
    for (const subscription of subscriptionsRef.current.values()) {
      subscription.close();
    }
    subscriptionsRef.current.clear();
  }, []);

  const subscribe = React.useCallback(
    (job: JobDto) => {
      close(job.id);
      const subscription = jobEvents.subscribe(job.id, {
        onUpdate(updated) {
          onUpdateRef.current(updated);
          if (terminalStatuses.has(updated.status)) {
            close(updated.id);
            onTerminalRef.current?.();
          }
        },
        onError() {
          close(job.id);
          onErrorRef.current?.();
        }
      });
      subscriptionsRef.current.set(job.id, subscription);
    },
    [close, jobEvents]
  );

  React.useEffect(() => closeAll, [closeAll]);

  return { subscribe, close, closeAll };
}
