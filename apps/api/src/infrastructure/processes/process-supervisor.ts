import type { ProcessExecutionPolicy } from "./process-execution-policy.js";
import type { RunningProcess } from "./process-runner.js";

export class ProcessTimeoutError extends Error {
  constructor(
    readonly command: string,
    readonly timeoutMs: number
  ) {
    super(`${command} timed out after ${timeoutMs} ms`);
    this.name = "ProcessTimeoutError";
  }
}

export class ProcessOutputLimitError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Process output exceeded ${maxBytes} bytes`);
    this.name = "ProcessOutputLimitError";
  }
}

export type SupervisedProcessResult =
  | { kind: "close"; code: number | null }
  | { kind: "error"; error: Error }
  | { kind: "timeout"; error: ProcessTimeoutError; forced: boolean };

export type SupervisedProcess = {
  promise: Promise<SupervisedProcessResult>;
  fail(error: Error): void;
  cancel(signal?: NodeJS.Signals): void;
};

export function superviseProcess(
  process: RunningProcess,
  command: string,
  policy: ProcessExecutionPolicy,
  options: { onForceSettle?: () => void } = {}
): SupervisedProcess {
  let settled = false;
  let timedOut = false;
  let forced = false;
  let timeout: NodeJS.Timeout | undefined;
  let killGrace: NodeJS.Timeout | undefined;
  let forceSettle: NodeJS.Timeout | undefined;
  let resolvePromise!: (result: SupervisedProcessResult) => void;

  const clearTimers = () => {
    if (timeout) clearTimeout(timeout);
    if (killGrace) clearTimeout(killGrace);
    if (forceSettle) clearTimeout(forceSettle);
    timeout = undefined;
    killGrace = undefined;
    forceSettle = undefined;
  };

  const settle = (result: SupervisedProcessResult) => {
    if (settled) return;
    settled = true;
    clearTimers();
    resolvePromise(result);
  };

  const timeoutError = () => new ProcessTimeoutError(command, policy.timeoutMs);

  const armForceSettle = () => {
    forceSettle = setTimeout(() => {
      if (settled) return;
      options.onForceSettle?.();
      settle({ kind: "timeout", error: timeoutError(), forced });
    }, policy.terminationGracePeriodMs);
    forceSettle.unref?.();
  };

  const beginTimeout = () => {
    if (settled || timedOut) return;
    timedOut = true;
    process.kill("SIGTERM");
    killGrace = setTimeout(() => {
      if (settled) return;
      forced = true;
      process.kill("SIGKILL");
      armForceSettle();
    }, policy.terminationGracePeriodMs);
    killGrace.unref?.();
  };

  const promise = new Promise<SupervisedProcessResult>((resolve) => {
    resolvePromise = resolve;
    process.on("error", (error) => {
      if (timedOut) return;
      settle({ kind: "error", error });
    });
    process.on("close", (code) => {
      if (timedOut) {
        settle({ kind: "timeout", error: timeoutError(), forced });
        return;
      }
      settle({ kind: "close", code });
    });
    timeout = setTimeout(beginTimeout, policy.timeoutMs);
    timeout.unref?.();
  });

  return {
    promise,
    fail(error: Error) {
      if (settled) return;
      process.kill("SIGTERM");
      settle({ kind: "error", error });
    },
    cancel(signal: NodeJS.Signals = "SIGTERM") {
      if (settled) return;
      process.kill(signal);
    }
  };
}
