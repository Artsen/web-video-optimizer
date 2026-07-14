import { describe, expect, it } from "vitest";
import { BoundedTextBuffer } from "./bounded-text-buffer.js";

describe("BoundedTextBuffer", () => {
  it("starts empty and accepts Buffer and string chunks up to the exact byte limit", () => {
    const buffer = new BoundedTextBuffer(5, "full");

    expect(buffer.toString()).toBe("");
    expect(buffer.byteLength).toBe(0);
    buffer.append(Buffer.from("ab"));
    buffer.append("cde");

    expect(buffer.toString()).toBe("abcde");
    expect(buffer.byteLength).toBe(5);
    expect(buffer.overflowed).toBe(false);
  });

  it("marks full-buffer overflow without retaining data beyond the configured byte limit", () => {
    const buffer = new BoundedTextBuffer(5, "full");

    buffer.append("abcd");
    buffer.append("ef");

    expect(buffer.toString()).toBe("abcd");
    expect(buffer.byteLength).toBe(4);
    expect(buffer.overflowed).toBe(true);
  });

  it("retains only the bounded tail as multiple chunks cross the limit", () => {
    const buffer = new BoundedTextBuffer(6, "tail");

    buffer.append("abc");
    buffer.append("def");
    buffer.append("ghi");

    expect(buffer.toString()).toBe("defghi");
    expect(buffer.byteLength).toBe(6);
    expect(buffer.overflowed).toBe(true);
  });

  it("counts UTF-8 bytes rather than JavaScript characters", () => {
    const buffer = new BoundedTextBuffer(4, "tail");

    buffer.append("ééé");

    expect(Buffer.byteLength("ééé")).toBe(6);
    expect(buffer.byteLength).toBe(4);
    expect(Buffer.byteLength(buffer.toString())).toBeLessThanOrEqual(6);
    expect(buffer.overflowed).toBe(true);
  });

  it("can be cleared for reuse", () => {
    const buffer = new BoundedTextBuffer(3, "tail");
    buffer.append("abcdef");

    buffer.clear();
    buffer.append("xy");

    expect(buffer.toString()).toBe("xy");
    expect(buffer.byteLength).toBe(2);
    expect(buffer.overflowed).toBe(false);
  });
});
