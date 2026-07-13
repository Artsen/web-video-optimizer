import type { RunningProcess } from "./process-runner.js";

export interface ProcessRegistry {
  get(jobId: string): RunningProcess | undefined;
  set(jobId: string, process: RunningProcess): void;
  delete(jobId: string): boolean;
  clear(): void;
}
