import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectContentSignature } from "./content-signature.js";

const tempDirs: string[] = [];

async function tempFile(bytes: Buffer): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-video-signature-"));
  tempDirs.push(root);
  const filePath = path.join(root, "upload.bin");
  await writeFile(filePath, bytes);
  return filePath;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("inspectContentSignature", () => {
  it("recognizes supported video container signatures", async () => {
    await expect(
      inspectContentSignature(await tempFile(Buffer.from("000000186674797069736f6d00", "hex")))
    ).resolves.toMatchObject({
      family: "isobmff",
      extension: ".mp4"
    });
    await expect(inspectContentSignature(await tempFile(Buffer.from("1a45dfa3", "hex")))).resolves.toMatchObject({
      family: "ebml",
      extension: ".webm"
    });
    await expect(
      inspectContentSignature(await tempFile(Buffer.from("524946460000000041564920", "hex")))
    ).resolves.toMatchObject({
      family: "avi",
      extension: ".avi"
    });
  });

  it("rejects unknown content before probing", async () => {
    const samples = [
      "not a video",
      "<!doctype html>",
      "%PDF-1.7",
      "PK\u0003\u0004",
      "MZ executable",
      "\u007fELF",
      "\u0089PNG\r\n\u001a\n",
      "\ufffd\ufffd\ufffd\ufffdJFIF",
      "GIF89a",
      "\u0000\u0000\u0000\u0018fty"
    ];
    for (const sample of samples) {
      await expect(inspectContentSignature(await tempFile(Buffer.from(sample, "latin1")))).rejects.toMatchObject({
        code: "UNSUPPORTED_MEDIA_TYPE"
      });
    }
  });
});
