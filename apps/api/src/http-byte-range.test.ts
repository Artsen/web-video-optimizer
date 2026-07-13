import { describe, expect, it } from "vitest";
import { parseByteRange } from "./http-byte-range.js";

describe("byte range parsing", () => {
  it("parses explicit start and end ranges", () => {
    expect(parseByteRange("bytes=0-499", 1000)).toEqual({ start: 0, end: 499 });
  });

  it("parses open-ended ranges", () => {
    expect(parseByteRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
  });

  it("parses suffix ranges from the end of the file", () => {
    expect(parseByteRange("bytes=-500", 1000)).toEqual({ start: 500, end: 999 });
  });

  it("clamps suffix ranges larger than the file", () => {
    expect(parseByteRange("bytes=-1500", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("clamps explicit end values larger than the file", () => {
    expect(parseByteRange("bytes=800-1500", 1000)).toEqual({ start: 800, end: 999 });
  });

  it("rejects starts at or beyond the file size", () => {
    expect(parseByteRange("bytes=1000-", 1000)).toBeUndefined();
    expect(parseByteRange("bytes=1001-", 1000)).toBeUndefined();
  });

  it("rejects ranges where end is before start", () => {
    expect(parseByteRange("bytes=500-499", 1000)).toBeUndefined();
  });

  it("rejects zero-length suffix ranges", () => {
    expect(parseByteRange("bytes=-0", 1000)).toBeUndefined();
  });

  it("rejects malformed numeric values", () => {
    expect(parseByteRange("bytes=a-500", 1000)).toBeUndefined();
    expect(parseByteRange("bytes=0-b", 1000)).toBeUndefined();
    expect(parseByteRange("items=0-500", 1000)).toBeUndefined();
  });

  it("rejects multiple ranges", () => {
    expect(parseByteRange("bytes=0-99,200-299", 1000)).toBeUndefined();
  });

  it("rejects empty files", () => {
    expect(parseByteRange("bytes=0-", 0)).toBeUndefined();
  });

  it("returns final bytes for the WebM suffix-range failure case", () => {
    expect(parseByteRange("bytes=-65536", 2_970_785)).toEqual({ start: 2_905_249, end: 2_970_784 });
  });
});
