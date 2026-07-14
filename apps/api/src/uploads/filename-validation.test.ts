import { describe, expect, it } from "vitest";
import { validateUploadOriginalName } from "./filename-validation.js";

describe("validateUploadOriginalName", () => {
  it("accepts ordinary filenames and trims surrounding whitespace", () => {
    expect(validateUploadOriginalName("  source video.mp4  ")).toBe("source video.mp4");
  });

  it("rejects empty names, path traversal, absolute paths, and control characters", () => {
    for (const name of [
      "",
      "   ",
      ".",
      "..",
      "../video.mp4",
      "nested/video.mp4",
      "C:\\video.mp4",
      "\\\\host\\share\\x.mp4",
      "bad\nname.mp4"
    ]) {
      expect(() => validateUploadOriginalName(name)).toThrow("Uploaded filename is not allowed.");
    }
  });

  it("rejects names above the byte limit", () => {
    expect(() => validateUploadOriginalName(`${"a".repeat(252)}.mp4`)).toThrow("Uploaded filename is not allowed.");
  });
});
