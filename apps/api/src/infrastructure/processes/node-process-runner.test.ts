import { describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { NodeProcessRunner } from "./node-process-runner.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({ on: vi.fn(), kill: vi.fn(), unref: vi.fn() }))
}));

describe("NodeProcessRunner", () => {
  it("passes command arguments and options unchanged", () => {
    const runner = new NodeProcessRunner();

    runner.spawn("tool", ["arg one", "arg-two"], { windowsHide: true, detached: true, stdio: "ignore" });

    expect(spawn).toHaveBeenCalledWith("tool", ["arg one", "arg-two"], {
      windowsHide: true,
      detached: true,
      stdio: "ignore"
    });
  });
});
