import { spawn, spawnSync } from "node:child_process";
import nodeFs from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const tmpRoot = path.join(repoRoot, ".tmp");
const pidFile = path.join(tmpRoot, "playwright-servers.json");
const storageRoot = process.env.E2E_STORAGE_ROOT ?? path.join(tmpRoot, "playwright-storage");
const e2ePorts = [4100, 4174];

async function removeTree(pathToRemove) {
  await fs.rm(pathToRemove, {
    force: true,
    maxRetries: 10,
    recursive: true,
    retryDelay: 250
  });
}

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

function spawnServer(command, args, env, logName) {
  const logPath = path.join(tmpRoot, logName);
  const logHandle = nodeFs.openSync(logPath, "a");
  const child = spawn(command, args, {
    cwd: repoRoot,
    detached: true,
    env,
    stdio: ["ignore", logHandle, logHandle],
    windowsHide: true
  });
  child.unref();
  return child.pid;
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // The process may already be gone.
  }
}

async function killPreviousServers() {
  try {
    const raw = await fs.readFile(pidFile, "utf8");
    const state = JSON.parse(raw);
    killTree(state.webPid);
    killTree(state.apiPid);
  } catch {
    // Missing or stale pid files are expected after interrupted local runs.
  }

  if (process.platform !== "win32") return;

  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
  if (result.status !== 0) return;

  const pids = new Set();
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (!match) continue;
    if (e2ePorts.includes(Number(match[1]))) pids.add(match[2]);
  }
  for (const pid of pids) killTree(pid);
}

export default async function globalSetup() {
  await killPreviousServers();
  await removeTree(storageRoot);
  await fs.mkdir(storageRoot, { recursive: true });
  await fs.mkdir(tmpRoot, { recursive: true });

  const apiPid = spawnServer(
    process.execPath,
    [path.join(repoRoot, "apps", "api", "dist", "server.js")],
    {
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
    },
    "playwright-api.log"
  );
  const webPid = spawnServer(
    process.execPath,
    [path.join(repoRoot, "e2e", "support", "start-e2e-web.mjs")],
    {
      ...process.env
    },
    "playwright-web.log"
  );

  await fs.writeFile(pidFile, JSON.stringify({ apiPid, webPid, storageRoot }, null, 2));
  await waitFor("http://127.0.0.1:4100/health");
  await waitFor("http://127.0.0.1:4174");
}
