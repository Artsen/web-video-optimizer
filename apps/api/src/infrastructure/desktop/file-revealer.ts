import path from "node:path";
import type { ProcessRunner } from "../processes/process-runner.js";

export interface FileRevealer {
  reveal(filePath: string): Promise<void>;
}

export class DesktopFileRevealer implements FileRevealer {
  constructor(private readonly processRunner: ProcessRunner) {}

  async reveal(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const directory = path.dirname(filePath);
      let command: string;
      let args: string[];

      if (process.platform === "win32") {
        command = "explorer.exe";
        args = [`/select,${filePath}`];
      } else if (process.platform === "darwin") {
        command = "open";
        args = ["-R", filePath];
      } else {
        command = "xdg-open";
        args = [directory];
      }

      const child = this.processRunner["spawn"](command, args, { detached: true, stdio: "ignore", windowsHide: true });
      child.on("error", reject);
      child.unref();
      resolve();
    });
  }
}
