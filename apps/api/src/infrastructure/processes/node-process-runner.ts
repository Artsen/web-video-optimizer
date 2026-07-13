import { spawn } from "node:child_process";
import type { ProcessRunner, ProcessSpawnOptions, RunningProcess } from "./process-runner.js";

export class NodeProcessRunner implements ProcessRunner {
  spawn(command: string, args: string[], options: ProcessSpawnOptions = {}): RunningProcess {
    return spawn(command, args, options) as RunningProcess;
  }
}
