import { defineConfig, devices } from "@playwright/test";

const apiPort = 4100;
const webPort = 4174;

export default defineConfig({
  testDir: "e2e/specs",
  globalSetup: "e2e/support/global-setup.mjs",
  globalTeardown: "e2e/support/global-teardown.mjs",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  globalTimeout: 180_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }
    }
  ],
  metadata: { apiPort, webPort }
});
