import type { ProcessOutput, ProcessRunner, ProcessSpawnOptions, RunningProcess } from "../process-runner.js";

class FakeProcessOutput implements ProcessOutput {
  readonly #listeners: Array<(chunk: Buffer | string) => void> = [];

  on(_event: "data", listener: (chunk: Buffer | string) => void): ProcessOutput {
    this.#listeners.push(listener);
    return this;
  }

  emit(chunk: Buffer | string): void {
    for (const listener of this.#listeners) listener(chunk);
  }
}

export class FakeRunningProcess implements RunningProcess {
  readonly stdout = new FakeProcessOutput();
  readonly stderr = new FakeProcessOutput();
  killedWith?: NodeJS.Signals;
  readonly killSignals: Array<NodeJS.Signals | undefined> = [];
  unrefCalled = false;
  readonly #errorListeners: Array<(error: Error) => void> = [];
  readonly #closeListeners: Array<(code: number | null) => void> = [];

  on(event: "error" | "close", listener: ((error: Error) => void) | ((code: number | null) => void)): this {
    if (event === "error") this.#errorListeners.push(listener as (error: Error) => void);
    if (event === "close") this.#closeListeners.push(listener as (code: number | null) => void);
    return this;
  }

  kill(signal?: NodeJS.Signals): boolean {
    this.killedWith = signal;
    this.killSignals.push(signal);
    return true;
  }

  unref(): void {
    this.unrefCalled = true;
  }

  emitStdout(chunk: Buffer | string): void {
    this.stdout.emit(chunk);
  }

  emitStderr(chunk: Buffer | string): void {
    this.stderr.emit(chunk);
  }

  emitError(error: Error): void {
    for (const listener of this.#errorListeners) listener(error);
  }

  emitClose(code: number | null): void {
    for (const listener of this.#closeListeners) listener(code);
  }
}

export class FakeProcessRunner implements ProcessRunner {
  readonly calls: Array<{ command: string; args: string[]; options?: ProcessSpawnOptions }> = [];
  readonly processes: FakeRunningProcess[] = [];

  spawn(command: string, args: string[], options?: ProcessSpawnOptions): FakeRunningProcess {
    const process = new FakeRunningProcess();
    this.calls.push({ command, args, options });
    this.processes.push(process);
    return process;
  }

  latest(): FakeRunningProcess {
    const process = this.processes.at(-1);
    if (!process) throw new Error("No fake process was spawned");
    return process;
  }
}
