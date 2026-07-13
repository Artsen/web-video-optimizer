import type { RunningProcess } from "./process-runner.js";
import type { ProcessRegistry } from "./process-registry.js";

export class InMemoryProcessRegistry implements ProcessRegistry {
  readonly #processes = new Map<string, RunningProcess>();

  get(jobId: string): RunningProcess | undefined {
    return this.#processes.get(jobId);
  }

  set(jobId: string, process: RunningProcess): void {
    this.#processes.set(jobId, process);
  }

  delete(jobId: string): boolean {
    return this.#processes.delete(jobId);
  }

  entries(): Array<[string, RunningProcess]> {
    return [...this.#processes.entries()];
  }

  clear(): void {
    this.#processes.clear();
  }
}
