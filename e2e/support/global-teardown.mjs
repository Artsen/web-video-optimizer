import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const pidFile = path.join(repoRoot, ".tmp", "playwright-servers.json");

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTree(pathToRemove) {
  await fs.rm(pathToRemove, {
    force: true,
    maxRetries: 10,
    recursive: true,
    retryDelay: 250
  });
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
    return;
  }
}

export default async function globalTeardown() {
  try {
    const raw = await fs.readFile(pidFile, "utf8");
    const state = JSON.parse(raw);
    killTree(state.webPid);
    killTree(state.apiPid);
    await delay(500);
    if (state.storageRoot) await removeTree(state.storageRoot);
  } finally {
    await fs.rm(pidFile, { force: true });
  }
}
