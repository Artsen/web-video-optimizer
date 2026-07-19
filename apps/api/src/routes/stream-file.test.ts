import { EventEmitter, once } from "node:events";
import { Readable, PassThrough } from "node:stream";
import type { FileHandle } from "node:fs/promises";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { streamFile } from "./stream-file.js";

describe("streamFile", () => {
  it("keeps opened storage handles alive when the request side closes before the response stream", async () => {
    const req = Object.assign(new EventEmitter(), { headers: {} }) as Request;
    const body = new Readable({ read() {} });
    const resBody = new PassThrough();
    const close = vi.fn(async () => undefined);
    const headers = new Map<string, string | number>();
    const res = Object.assign(resBody, {
      setHeader: vi.fn((name: string, value: string | number) => {
        headers.set(name, value);
      }),
      status: vi.fn(() => res)
    }) as unknown as Response;

    await streamFile(
      req,
      res,
      {
        filePath: "stored.mp4",
        fileName: "source.mp4",
        open: async () => ({
          handle: {
            close,
            createReadStream: () => body
          } as unknown as FileHandle,
          path: "stored.mp4",
          size: 5
        })
      },
      "attachment"
    );

    req.emit("close");
    expect(close).not.toHaveBeenCalled();

    body.push("hello");
    body.push(null);
    await once(resBody, "finish");

    expect(headers.get("Content-Length")).toBe(5);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
