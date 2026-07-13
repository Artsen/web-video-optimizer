import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "../src/index.js";

describe("sanitizeFileName", () => {
  it("sanitizes spaces and repeated punctuation", () => {
    expect(sanitizeFileName("Product Video final!!!.mp4")).toBe("Product-Video-final.mp4");
  });

  it("preserves safe characters and extensions", () => {
    expect(sanitizeFileName("already_safe-file.webm")).toBe("already_safe-file.webm");
  });

  it("replaces unicode or unsupported characters", () => {
    expect(sanitizeFileName("héllo world.mov")).toBe("h-llo-world.mov");
  });

  it("trims leading and trailing separators", () => {
    expect(sanitizeFileName("---clip---")).toBe("clip");
  });

  it("preserves the final!.mp4 behavior", () => {
    expect(sanitizeFileName("final!.mp4")).toBe("final.mp4");
  });

  it("returns empty strings for empty or punctuation-only names", () => {
    expect(sanitizeFileName("")).toBe("");
    expect(sanitizeFileName("!!!")).toBe("");
  });
});
