import type { StoragePolicyService } from "./storage-policy-service.js";

export type TimerHandle = ReturnType<typeof setInterval>;

export class StorageHousekeepingService {
  #timer: TimerHandle | undefined;
  #running: Promise<void> | undefined;
  #stopping = false;

  constructor(
    private readonly policy: StoragePolicyService,
    private readonly intervalMs: number,
    private readonly timers: {
      setInterval: typeof setInterval;
      clearInterval: typeof clearInterval;
    } = { setInterval, clearInterval }
  ) {}

  start(): void {
    void this.runOnce();
    this.#timer = this.timers.setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
    this.#timer.unref?.();
  }

  async runOnce(): Promise<void> {
    if (this.#stopping || this.#running) return this.#running;
    this.#running = this.policy
      .cleanupStaleTemporaryFiles()
      .then((result) => {
        if (result.removedFileCount > 0) {
          console.info(`Cleaned ${result.removedFileCount} stale temporary file(s).`);
        }
      })
      .catch((error) => console.warn("Storage housekeeping failed:", error))
      .finally(() => {
        this.#running = undefined;
      });
    return this.#running;
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    if (this.#timer) this.timers.clearInterval(this.#timer);
    await this.#running;
  }
}
