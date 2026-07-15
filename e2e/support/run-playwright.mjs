import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const storageRoot = path.join(repoRoot, ".tmp", "playwright-storage");

async function removeTree(pathToRemove) {
  await fs.rm(pathToRemove, {
    force: true,
    maxRetries: 10,
    recursive: true,
    retryDelay: 250
  });
}

async function run(command, args, env = {}) {
  await new Promise((resolve, reject) => {
    const executable = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : command;
    const childArgs = process.platform === "win32" ? ["/d", "/s", "/c", [command, ...args].join(" ")] : args;
    const childEnv = Object.fromEntries(
      Object.entries({ ...process.env, ...env }).filter((entry) => entry[1] !== undefined)
    );
    const child = spawn(executable, childArgs, {
      cwd: repoRoot,
      env: childEnv,
      stdio: "inherit",
      windowsHide: true
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  await removeTree(storageRoot);
  await fs.mkdir(storageRoot, { recursive: true });
  await run("npm", ["run", "build"], {
    VITE_API_BASE_URL: "http://127.0.0.1:4100"
  });
  try {
    await run("npx", ["playwright", "test", ...process.argv.slice(2)], {
      E2E_STORAGE_ROOT: storageRoot
    });
  } finally {
    await removeTree(storageRoot);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
