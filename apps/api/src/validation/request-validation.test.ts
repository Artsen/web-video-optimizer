import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "../errors/api-error.js";
import {
  HistoryDeleteBodySchema,
  IdParamsSchema,
  OutputFileNameSchema,
  RenameVideoBodySchema,
  SafeIdSchema
} from "./api-schemas.js";
import { parseBody, parseParams } from "./request-validation.js";
import { formatValidationIssues } from "./validation-error.js";

function request(body: unknown, params: Record<string, unknown> = {}) {
  return { body, params } as never;
}

describe("request validation helpers", () => {
  it("returns typed valid bodies and params", () => {
    expect(parseBody(RenameVideoBodySchema, request({ originalName: " clip.mp4 " }))).toEqual({
      originalName: "clip.mp4"
    });
    expect(parseParams(IdParamsSchema, request({}, { id: "abc_123-xyz" }))).toEqual({ id: "abc_123-xyz" });
  });

  it("rejects invalid bodies and params with safe ApiError details", () => {
    expect(() => parseBody(RenameVideoBodySchema, request({ originalName: "" }))).toThrow(ApiError);
    try {
      parseParams(IdParamsSchema, request({}, { id: "../secret" }));
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).details).toEqual([{ path: "id", message: "ID contains unsupported characters" }]);
    }
  });

  it("rejects strict unknown fields including prototype-like keys", () => {
    expect(() => parseBody(RenameVideoBodySchema, request({ originalName: "x.mp4", extra: true }))).toThrow(ApiError);
    expect(() =>
      parseBody(RenameVideoBodySchema, request(JSON.parse('{"originalName":"x.mp4","__proto__":{"polluted":true}}')))
    ).toThrow(ApiError);
    expect(() =>
      parseBody(RenameVideoBodySchema, request({ originalName: "x.mp4", constructor: { prototype: {} } }))
    ).toThrow(ApiError);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects invalid IDs and dangerous filename boundaries", () => {
    for (const value of ["../../../etc/passwd", "..\\..\\windows\\system32", "%2e%2e%2f", "a".repeat(129), "\0"]) {
      expect(() => SafeIdSchema.parse(value)).toThrow();
    }
    for (const value of ["../x.mp4", "..\\x.mp4", "bad\0name.mp4", "bad\x1Fname.mp4", ".", ".."]) {
      expect(() => OutputFileNameSchema.parse(value)).toThrow();
    }
  });

  it("rejects arrays and nested objects where strings are expected", () => {
    expect(() => parseBody(RenameVideoBodySchema, request({ originalName: ["clip.mp4"] }))).toThrow(ApiError);
    expect(() => parseBody(RenameVideoBodySchema, request({ originalName: { name: "clip.mp4" } }))).toThrow(ApiError);
  });

  it("deduplicates validated history IDs", () => {
    expect(parseBody(HistoryDeleteBodySchema, request({ videoIds: ["a", "a"], jobIds: ["b", "b"] }))).toEqual({
      videoIds: ["a"],
      jobIds: ["b"]
    });
  });

  it("formats and limits validation issues without leaking raw Zod internals", () => {
    const schema = z
      .object({
        a: z.string(),
        b: z.string(),
        c: z.string(),
        d: z.string(),
        e: z.string(),
        f: z.string(),
        g: z.string(),
        h: z.string(),
        i: z.string()
      })
      .strict();
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = formatValidationIssues(result.error);
      expect(issues).toHaveLength(8);
      expect(JSON.stringify(issues)).not.toContain("ZodError");
      expect(issues[0]).toHaveProperty("path");
      expect(issues[0]).toHaveProperty("message");
    }
  });
});
