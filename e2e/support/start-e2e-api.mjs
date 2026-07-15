import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const storageRoot = process.env.E2E_STORAGE_ROOT ?? path.join(repoRoot, ".tmp", "playwright-storage");

await fs.mkdir(storageRoot, { recursive: true });

const child = spawn(process.execPath, [path.join(repoRoot, "apps", "api", "dist", "server.js")], {
  cwd: repoRoot,
  env: {
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
  stdio: "inherit",
  windowsHide: true
});

const shutdown = () => {
  if (child.exitCode === null) child.kill("SIGTERM");
  setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
    process.exit(0);
  }, 5000).unref();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
child.once("exit", (code) => process.exit(code ?? 0));
