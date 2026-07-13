export type ScheduledMediaTask = {
  jobId: string;
  run: () => Promise<void>;
  onUnhandledError?: (error: unknown) => Promise<void> | void;
};

export type JobSchedulerSnapshot = {
  maxConcurrency: number;
  queuedJobIds: string[];
  runningJobIds: string[];
};

export interface QueuedTaskCanceler {
  cancelQueued(jobId: string): boolean;
}

export interface JobScheduler extends QueuedTaskCanceler {
  enqueue(task: ScheduledMediaTask): void;
  isQueued(jobId: string): boolean;
  isRunning(jobId: string): boolean;
  getSnapshot(): JobSchedulerSnapshot;
}
