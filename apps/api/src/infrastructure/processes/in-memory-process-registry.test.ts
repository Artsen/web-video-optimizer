import { describe, expect, it } from "vitest";
import { FakeRunningProcess } from "./test/fake-process-runner.js";
import { InMemoryProcessRegistry } from "./in-memory-process-registry.js";

describe("InMemoryProcessRegistry", () => {
  it("returns copied entries without exposing the backing map", () => {
    const registry = new InMemoryProcessRegistry();
    const process = new FakeRunningProcess();
    registry.set("job-1", process);

    const entries = registry.entries();
    entries.pop();

    expect(registry.entries()).toEqual([["job-1", process]]);
    expect(registry.get("job-1")).toBe(process);
    expect(registry.delete("job-1")).toBe(true);
    expect(registry.entries()).toEqual([]);
  });
});
