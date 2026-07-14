import { open } from "node:fs/promises";
import { uploadErrors } from "./upload-errors.js";

export type MediaContainerFamily = "isobmff" | "ebml" | "avi" | "ogg" | "flv" | "mpeg-ps" | "mpeg-ts" | "asf";

export type ContentSignature = {
  family: MediaContainerFamily;
  extension: string;
};

const maxProbeBytes = 65_536;

export async function inspectContentSignature(filePath: string, maxBytes = maxProbeBytes): Promise<ContentSignature> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return inspectContentBuffer(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

export function inspectContentBuffer(buffer: Buffer): ContentSignature {
  if (buffer.length < 4) throw uploadErrors.unsupportedMedia();
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") return { family: "isobmff", extension: ".mp4" };
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    return { family: "ebml", extension: ".webm" };
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "AVI ") {
    return { family: "avi", extension: ".avi" };
  }
  if (buffer.subarray(0, 4).toString("ascii") === "OggS") return { family: "ogg", extension: ".ogv" };
  if (buffer.subarray(0, 3).toString("ascii") === "FLV") return { family: "flv", extension: ".flv" };
  if (buffer.subarray(0, 4).equals(Buffer.from([0x30, 0x26, 0xb2, 0x75]))) return { family: "asf", extension: ".wmv" };
  if (buffer[0] === 0x47 && buffer.length > 188 && buffer[188] === 0x47) return { family: "mpeg-ts", extension: ".ts" };
  if (buffer.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0xba]))) {
    return { family: "mpeg-ps", extension: ".mpg" };
  }
  throw uploadErrors.unsupportedMedia();
}
