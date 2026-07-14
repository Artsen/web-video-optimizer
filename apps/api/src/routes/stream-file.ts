import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import { sanitizeFileName } from "@local-video-optimizer/video-core";
import { parseByteRange } from "../http-byte-range.js";
import type { StreamDescriptor } from "../runtime/api-runtime.js";

export function contentTypeFor(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".mp4" || extension === ".m4v") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".mkv") return "video/x-matroska";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".png") return "image/png";
  if (extension === ".vtt") return "text/vtt";
  if (extension === ".srt") return "application/x-subrip";
  if (extension === ".zip") return "application/zip";
  return "application/octet-stream";
}

export async function streamFile(
  req: Request,
  res: Response,
  descriptor: StreamDescriptor,
  disposition: "inline" | "attachment"
): Promise<void> {
  const opened = descriptor.open ? await descriptor.open() : undefined;
  const fileStat = opened ? undefined : await stat(descriptor.filePath);
  const size = opened?.size ?? fileStat!.size;
  const range = req.headers.range;
  const safeName = safeContentDispositionName(descriptor.fileName);
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await opened?.handle.close().catch(() => undefined);
  };

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentTypeFor(descriptor.fileName));
  res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);
  req.on("close", () => {
    void close();
  });

  if (!range) {
    res.setHeader("Content-Length", size);
    const stream = opened ? opened.handle.createReadStream() : createReadStream(descriptor.filePath);
    stream.on("error", () => void close());
    stream.on("end", () => void close());
    stream.pipe(res);
    return;
  }

  const parsedRange = parseByteRange(range, size);
  if (!parsedRange) {
    await close();
    res.status(416).setHeader("Content-Range", `bytes */${size}`);
    res.end();
    return;
  }

  const { start, end } = parsedRange;
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  res.setHeader("Content-Length", end - start + 1);
  const stream = opened
    ? opened.handle.createReadStream({ start, end })
    : createReadStream(descriptor.filePath, { start, end });
  stream.on("error", () => void close());
  stream.on("end", () => void close());
  stream.pipe(res);
}

function safeContentDispositionName(fileName: string): string {
  return sanitizeFileName(fileName).replace(/["\r\n\\]/g, "") || "download";
}
