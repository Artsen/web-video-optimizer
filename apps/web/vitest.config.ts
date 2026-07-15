import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/testing/setup.ts"],
    coverage: {
      reporter: ["text", "lcov"],
      reportsDirectory: "../../coverage/web"
    }
  }
});
