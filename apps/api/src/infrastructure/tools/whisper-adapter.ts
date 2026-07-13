import fs from "node:fs";
import type { ApiConfig } from "../../config.js";
import type { CommandRunner } from "./command-runner.js";

export interface WhisperAdapter {
  resolveCommand(): Promise<string | undefined>;
  modelPath(): string | undefined;
  hasModel(): boolean;
}

export class ConfigWhisperAdapter implements WhisperAdapter {
  constructor(
    private readonly config: ApiConfig,
    private readonly commandRunner: CommandRunner
  ) {}

  async resolveCommand(): Promise<string | undefined> {
    const configuredCommand = this.config.whisperCppBin;
    const candidates = configuredCommand ? [configuredCommand] : ["whisper-cli", "main", "whisper-cpp"];
    for (const candidate of candidates) {
      if (await this.commandRunner.commandExists(candidate)) return candidate;
    }
    return undefined;
  }

  modelPath(): string | undefined {
    return this.config.whisperCppModel;
  }

  hasModel(): boolean {
    const model = this.modelPath();
    return Boolean(model && fs.existsSync(model));
  }
}
