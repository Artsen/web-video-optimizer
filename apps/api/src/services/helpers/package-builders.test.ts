import { describe, expect, it } from "vitest";
import { cleanCaptionText, createZip, escapeHtml, isoDuration, transcriptFromVtt } from "./package-builders.js";

describe("package builders", () => {
  it("creates a zip with expected entry names", () => {
    const zip = createZip([
      { name: "video.mp4", data: Buffer.from("video") },
      { name: "nested\\captions.vtt", data: Buffer.from("WEBVTT") }
    ]);

    expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(zip.includes(Buffer.from("video.mp4"))).toBe(true);
    expect(zip.includes(Buffer.from("nested/captions.vtt"))).toBe(true);
  });

  it("keeps generated HTML helpers stable", () => {
    expect(escapeHtml('<video label="A&B">')).toBe("&lt;video label=&quot;A&amp;B&quot;&gt;");
    expect(isoDuration(65)).toBe("PT1M5S");
  });

  it("extracts and cleans transcript text", () => {
    const vtt = "WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n[BLANK_AUDIO]\nHello\n";

    expect(transcriptFromVtt(vtt)).toBe("Hello\nHello");
    expect(cleanCaptionText(vtt)).toBe("WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n");
  });
});
