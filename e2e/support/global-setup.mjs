import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const tmpRoot = path.join(repoRoot, ".tmp");
const pidFile = path.join(tmpRoot, "playwright-servers.json");
const storageRoot = process.env.E2E_STORAGE_ROOT ?? path.join(tmpRoot, "playwright-storage");

async function waitFor(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // wait until the server is ready
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function spawnServer(command, args, env) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    detached: true,
    env,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return child.pid;
}

export default async function globalSetup() {
  await fs.rm(storageRoot, { force: true, recursive: true });
  await fs.mkdir(storageRoot, { recursive: true });

  const apiPid = spawnServer(process.execPath, [path.join(repoRoot, "apps", "api", "dist", "server.js")], {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "4100",
    ALLOW_LAN_ACCESS: "false",
    CORS_ORIGIN: "http://127.0.0.1:4174",
    STORAGE_ROOT: storageRoot,
    MAX_CONCURRENT_MEDIA_JOBS: "1",
    MEDIA_PROCESS_TIMEOUT_MS: "120000",
    TOOL_COMMAND_TIMEOUT_MS: "30000",
    PROCESS_KILL_GRACE_PERIOD_MS: "3000"
  });
  const webPid = spawnServer(process.execPath, [path.join(repoRoot, "e2e", "support", "start-e2e-web.mjs")], {
    ...process.env
  });

  await fs.mkdir(tmpRoot, { recursive: true });
  await fs.writeFile(pidFile, JSON.stringify({ apiPid, webPid, storageRoot }, null, 2));
  await waitFor("http://127.0.0.1:4100/health");
  await waitFor("http://127.0.0.1:4174");
}
