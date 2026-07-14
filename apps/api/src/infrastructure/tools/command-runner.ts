import { BoundedTextBuffer } from "../processes/bounded-text-buffer.js";
import type { ProcessExecutionPolicy } from "../processes/process-execution-policy.js";
import type { ProcessRunner } from "../processes/process-runner.js";
import { ProcessOutputLimitError, superviseProcess } from "../processes/process-supervisor.js";

export type CommandRunner = {
  run(command: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }>;
  runJson(command: string, args: string[]): Promise<unknown>;
  commandExists(command: string, args?: string[]): Promise<boolean>;
};

export function createCommandRunner(processRunner: ProcessRunner, policy: ProcessExecutionPolicy): CommandRunner {
  async function run(
    command: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    const child = processRunner.spawn(command, args, { windowsHide: true });
    const stdout = new BoundedTextBuffer(policy.maxCapturedOutputBytes, "full");
    const stderr = new BoundedTextBuffer(policy.maxCapturedOutputBytes, "tail");
    const supervisor = superviseProcess(child, command, policy);

    child.stdout?.on("data", (chunk) => {
      stdout.append(chunk);
      if (stdout.overflowed) {
        supervisor.fail(new ProcessOutputLimitError(policy.maxCapturedOutputBytes));
      }
    });
    child.stderr?.on("data", (chunk) => {
      stderr.append(chunk);
    });

    const result = await supervisor.promise;
    if (result.kind === "error") throw result.error;
    if (result.kind === "timeout") throw result.error;
    return { stdout: stdout.toString(), stderr: stderr.toString(), code: result.code };
  }

  return {
    run,
    async runJson(command: string, args: string[]): Promise<unknown> {
      const result = await run(command, args);
      if (result.code !== 0) {
        throw new Error(result.stderr || `${command} exited with code ${result.code}`);
      }
      return JSON.parse(result.stdout);
    },
    async commandExists(command: string, args = ["--help"]): Promise<boolean> {
      try {
        const child = processRunner.spawn(command, args, { windowsHide: true });
        const supervisor = superviseProcess(child, command, policy);
        const result = await supervisor.promise;
        return result.kind === "close";
      } catch {
        return false;
      }
    }
  };
}
