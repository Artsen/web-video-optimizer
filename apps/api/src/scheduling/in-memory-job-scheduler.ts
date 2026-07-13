import type { JobScheduler, JobSchedulerSnapshot, ScheduledMediaTask } from "./job-scheduler.js";

export class InMemoryJobScheduler implements JobScheduler {
  readonly #queued: ScheduledMediaTask[] = [];
  readonly #running = new Set<string>();
  readonly #idleWaiters: Array<() => void> = [];
  #accepting = true;

  constructor(private readonly maxConcurrency: number) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency <= 0) {
      throw new Error(`Invalid max media concurrency: ${maxConcurrency}`);
    }
  }

  enqueue(task: ScheduledMediaTask): void {
    if (!this.#accepting) {
      throw new Error("Job scheduler is not accepting new tasks");
    }
    if (this.isQueued(task.jobId) || this.isRunning(task.jobId)) {
      throw new Error(`Job is already scheduled: ${task.jobId}`);
    }

    this.#queued.push(task);
    this.drain();
  }

  stopAccepting(): void {
    this.#accepting = false;
  }

  cancelAllQueued(): string[] {
    const canceled = this.#queued.map((task) => task.jobId);
    this.#queued.length = 0;
    this.resolveIdleIfNeeded();
    return canceled;
  }

  waitForIdle(): Promise<void> {
    if (this.#running.size === 0 && this.#queued.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.#idleWaiters.push(resolve);
    });
  }

  isAccepting(): boolean {
    return this.#accepting;
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
      runningJobIds: [...this.#running],
      accepting: this.#accepting
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
      this.resolveIdleIfNeeded();
    }
  }

  private resolveIdleIfNeeded(): void {
    if (this.#running.size > 0 || this.#queued.length > 0) return;
    for (const resolve of this.#idleWaiters.splice(0)) resolve();
  }
}
