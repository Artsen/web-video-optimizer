import { describe, expect, it } from "vitest";
import {
  assertLooksLikeVtt,
  formatCaptionTimestamp,
  parseCaptionTimestamp,
  shiftCaptionTimings,
  vttToSrt
} from "../src/index.js";

describe("caption timestamps", () => {
  it("parses decimal and comma timestamps with hours and no-hours input", () => {
    expect(parseCaptionTimestamp("00:01:02.345")).toBe(62.345);
    expect(parseCaptionTimestamp("01:02.345")).toBe(62.345);
    expect(parseCaptionTimestamp("00:01:02,345")).toBe(62.345);
  });

  it("rejects invalid timestamps", () => {
    expect(parseCaptionTimestamp("1:02.345")).toBeUndefined();
    expect(parseCaptionTimestamp("nope")).toBeUndefined();
  });

  it("formats timestamps and clamps negative output", () => {
    expect(formatCaptionTimestamp(62.345)).toBe("00:01:02.345");
    expect(formatCaptionTimestamp(62.345, ",")).toBe("00:01:02,345");
    expect(formatCaptionTimestamp(-3)).toBe("00:00:00.000");
  });

  it("shifts subtitle timing forward and leaves invalid timing untouched", () => {
    expect(shiftCaptionTimings("00:00:01.000 --> 00:00:02.000\nHello", 4)).toBe("00:00:05.000 --> 00:00:06.000\nHello");
    expect(shiftCaptionTimings("bad --> 00:00:02.000\nHello", 4)).toBe("bad --> 00:00:02.000\nHello");
  });

  it("does no-op shifts when offset is zero or negative", () => {
    expect(shiftCaptionTimings("00:00:01.000 --> 00:00:02.000\nHello", 0)).toBe("00:00:01.000 --> 00:00:02.000\nHello");
  });
});

describe("VTT conversion", () => {
  it("converts valid VTT with headers, identifiers, cue settings, and NOTE blocks to SRT", () => {
    expect(
      vttToSrt(`WEBVTT

NOTE ignore this

cue-1
00:00:01.000 --> 00:00:02.500 align:start position:0%
Hello

00:00:03.000 --> 00:00:04.000
World

00:00:05.000 --> 00:00:06.000

`)
    ).toBe(`1
00:00:01,000 --> 00:00:02,500
Hello

2
00:00:03,000 --> 00:00:04,000
World
`);
  });

  it("validates the presence of a timing arrow", () => {
    expect(() => assertLooksLikeVtt("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi")).not.toThrow();
    expect(() => assertLooksLikeVtt("WEBVTT\n\nNo cues")).toThrow(
      "Caption text must contain at least one WebVTT cue with a timing arrow."
    );
  });
});
