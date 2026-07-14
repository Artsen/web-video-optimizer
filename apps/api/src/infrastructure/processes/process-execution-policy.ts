export type ProcessExecutionPolicy = {
  timeoutMs: number;
  terminationGracePeriodMs: number;
  maxCapturedOutputBytes: number;
};
