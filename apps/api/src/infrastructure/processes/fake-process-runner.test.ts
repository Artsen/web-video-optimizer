import { describe, expect, it } from "vitest";
import { FakeProcessRunner } from "./test/fake-process-runner.js";

describe("FakeProcessRunner", () => {
  it("captures spawned commands and process lifecycle calls", () => {
    const runner = new FakeProcessRunner();
    const process = runner.spawn("ffmpeg", ["-version"], { windowsHide: true });

    expect(runner.calls).toEqual([{ command: "ffmpeg", args: ["-version"], options: { windowsHide: true } }]);

    process.kill("SIGTERM");
    process.unref();

    expect(process.killedWith).toBe("SIGTERM");
    expect(process.unrefCalled).toBe(true);
  });
});
