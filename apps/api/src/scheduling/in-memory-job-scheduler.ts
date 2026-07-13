import type { JobScheduler, JobSchedulerSnapshot, ScheduledMediaTask } from "./job-scheduler.js";

export class InMemoryJobScheduler implements JobScheduler {
  readonly #queued: ScheduledMediaTask[] = [];
  readonly #running = new Set<string>();

  constructor(private readonly maxConcurrency: number) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency <= 0) {
      throw new Error(`Invalid max media concurrency: ${maxConcurrency}`);
    }
  }

  enqueue(task: ScheduledMediaTask): void {
    if (this.isQueued(task.jobId) || this.isRunning(task.jobId)) {
      throw new Error(`Job is already scheduled: ${task.jobId}`);
    }

    this.#queued.push(task);
    this.drain();
  }

  cancelQueued(jobId: string): boolean {
    const index = this.#queued.findIndex((task) => task.jobId === jobId);
    if (index === -1) return false;
    this.#queued.splice(index, 1);
    return true;
  }

  isQueued(jobId: string): boolean {
    return this.#queued.some((task) => task.jobId === jobId);
  }

  isRunning(jobId: string): boolean {
    return this.#running.has(jobId);
  }

  getSnapshot(): JobSchedulerSnapshot {
    return {
      maxConcurrency: this.maxConcurrency,
      queuedJobIds: this.#queued.map((task) => task.jobId),
      runningJobIds: [...this.#running]
    };
  }

  private drain(): void {
    while (this.#running.size < this.maxConcurrency && this.#queued.length > 0) {
      const task = this.#queued.shift()!;
      this.#running.add(task.jobId);
      void this.runTask(task);
    }
  }

  private async runTask(task: ScheduledMediaTask): Promise<void> {
    try {
      await task.run();
    } catch (error) {
      await task.onUnhandledError?.(error);
    } finally {
      this.#running.delete(task.jobId);
      this.drain();
    }
  }
}
