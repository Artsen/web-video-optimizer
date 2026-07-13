import type { ProcessRunner } from "../processes/process-runner.js";

export type CommandRunner = {
  run(command: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }>;
  runJson(command: string, args: string[]): Promise<unknown>;
  commandExists(command: string, args?: string[]): Promise<boolean>;
};

export function createCommandRunner(processRunner: ProcessRunner): CommandRunner {
  async function run(
    command: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve, reject) => {
      const child = processRunner["spawn"](command, args, { windowsHide: true });
      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ stdout, stderr, code }));
    });
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
      return new Promise((resolve) => {
        const child = processRunner["spawn"](command, args, { windowsHide: true });
        child.on("error", () => resolve(false));
        child.on("close", () => resolve(true));
      });
    }
  };
}
