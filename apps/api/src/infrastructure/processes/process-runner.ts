export type ProcessOutput = {
  on(event: "data", listener: (chunk: Buffer | string) => void): ProcessOutput;
};

export type ProcessSpawnOptions = {
  windowsHide?: boolean;
  detached?: boolean;
  stdio?: "ignore";
};

export interface RunningProcess {
  stdout?: ProcessOutput | null;
  stderr?: ProcessOutput | null;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: (code: number | null) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
  unref(): void;
}

export interface ProcessRunner {
  spawn(command: string, args: string[], options?: ProcessSpawnOptions): RunningProcess;
}
