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
  const fileStat = await stat(descriptor.filePath);
  const range = req.headers.range;
  const safeName = sanitizeFileName(descriptor.fileName);

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentTypeFor(descriptor.fileName));
  res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);

  if (!range) {
    res.setHeader("Content-Length", fileStat.size);
    createReadStream(descriptor.filePath).pipe(res);
    return;
  }

  const parsedRange = parseByteRange(range, fileStat.size);
  if (!parsedRange) {
    res.status(416).setHeader("Content-Range", `bytes */${fileStat.size}`);
    res.end();
    return;
  }

  const { start, end } = parsedRange;
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${fileStat.size}`);
  res.setHeader("Content-Length", end - start + 1);
  createReadStream(descriptor.filePath, { start, end }).pipe(res);
}
