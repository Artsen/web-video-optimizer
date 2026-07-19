import { spawn } from "node:child_process";
import process from "node:process";

const child = spawn(process.execPath, ["e2e/support/run-playwright.mjs", "e2e/specs/screenshot-review.spec.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, UI_SCREENSHOT_REVIEW: "1" },
  stdio: "inherit",
  windowsHide: true
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
