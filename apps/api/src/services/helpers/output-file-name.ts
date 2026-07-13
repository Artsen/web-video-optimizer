import path from "node:path";
import { sanitizeFileName } from "@local-video-optimizer/video-core";

export function renamedOutputFileName(currentName: string, nextName: string): string {
  const cleanName = sanitizeFileName(path.parse(nextName).name);
  const currentExtension = path.extname(currentName);
  const requestedExtension = path.extname(nextName);
  const extension =
    requestedExtension && requestedExtension.toLowerCase() === currentExtension.toLowerCase()
      ? requestedExtension
      : currentExtension;
  return `${cleanName || path.parse(currentName).name}${extension}`;
}
