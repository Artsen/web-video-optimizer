import type { JobDto } from "@local-video-optimizer/contracts";
import type { CompiledApiHarness } from "./compiled-api-harness.js";

export async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  if (!response.ok)
    throw new Error(`${init?.method ?? "GET"} ${url} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

export async function waitForTerminalJob(
  harness: CompiledApiHarness,
  jobId: string,
  timeoutMs = 60_000
): Promise<JobDto> {
  const deadline = Date.now() + timeoutMs;
  let lastJob: JobDto | undefined;
  while (Date.now() < deadline) {
    lastJob = await jsonRequest<JobDto>(`${harness.baseUrl}/api/jobs/${jobId}`);
    if (["completed", "failed", "canceled"].includes(lastJob.status)) return lastJob;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for job ${jobId}. Last job: ${JSON.stringify(lastJob)}\nstdout:\n${harness.stdoutTail()}\nstderr:\n${harness.stderrTail()}`
  );
}

export async function waitForJobStatus(
  harness: CompiledApiHarness,
  jobId: string,
  status: JobDto["status"],
  timeoutMs = 20_000
): Promise<JobDto> {
  const deadline = Date.now() + timeoutMs;
  let lastJob: JobDto | undefined;
  while (Date.now() < deadline) {
    lastJob = await jsonRequest<JobDto>(`${harness.baseUrl}/api/jobs/${jobId}`);
    if (lastJob.status === status) return lastJob;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${jobId} to become ${status}. Last job: ${JSON.stringify(lastJob)}`);
}
