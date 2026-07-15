import { describe, expect, it } from "vitest";
import { cleanSubtitleDraft, formatBitrate, formatBytes, formatDuration, slugify } from "./formatters";
import { buildVideoMarkup, fileSizeDelta, qualityLabel, variationBadges, variationDetails } from "./job-presenters";
import { job, settings } from "../testing/fixtures";

describe("formatters and presenters", () => {
  it("formats media values and safe slugs", () => {
    expect(slugify("Final Video!.mp4")).toBe("final-video-.mp4");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
    expect(formatBitrate(2_500_000)).toBe("2.50 Mbps");
    expect(formatDuration(75)).toBe("1:15");
  });

  it("cleans generated subtitle draft noise", () => {
    expect(cleanSubtitleDraft("WEBVTT\n\n[BLANK_AUDIO]\nHello\nHello\n00:00.000 --> 00:01.000\nWorld")).toContain(
      "Hello\n00:00.000 --> 00:01.000\nWorld"
    );
  });

  it("presents job details and embed markup", () => {
    const encode = job({
      settings: settings({ outputContainer: "webm", videoCodec: "libaom-av1", audioCodec: "libopus" })
    });

    expect(qualityLabel(settings({ crf: 38, videoCodec: "libaom-av1" }))).toBe("Small modern file");
    expect(fileSizeDelta(500, 1000)).toBe("50% smaller");
    expect(variationDetails(encode)).toContain("CRF 26");
    expect(variationBadges(encode, encode.id)).toEqual(["Modern source", "Smallest export"]);
    expect(buildVideoMarkup(encode, encode.settings)).toContain('type="video/webm"');
  });
});
