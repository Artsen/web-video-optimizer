import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StorageBoundary, isPathInside } from "./storage-boundary.js";

const tempDirs: string[] = [];

async function makeStorage(): Promise<{ root: string; storage: StorageBoundary }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-video-storage-"));
  tempDirs.push(root);
  const storage = new StorageBoundary({
    root,
    uploads: path.join(root, "uploads"),
    outputs: path.join(root, "outputs"),
    tmp: path.join(root, "tmp"),
    "upload-staging": path.join(root, "tmp", "upload-staging")
  });
  await storage.initialize();
  return { root, storage };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("StorageBoundary", () => {
  it("checks containment without accepting sibling paths", () => {
    const root = path.resolve("storage");
    expect(isPathInside(root, path.join(root, "uploads", "x.mp4"))).toBe(true);
    expect(isPathInside(root, `${root}-other`)).toBe(false);
  });

  it("rejects escaping paths and opens only regular contained files", async () => {
    const { root, storage } = await makeStorage();
    const upload = path.join(root, "uploads", "source.mp4");
    await writeFile(upload, "video");

    await expect(storage.openFile("uploads", upload)).resolves.toMatchObject({ size: 5, path: upload });
    await expect(storage.openFile("uploads", path.join(root, "..", "outside.mp4"))).rejects.toThrow(
      "Path escapes uploads"
    );
    expect(() => storage.pathFor("uploads", "../outside.mp4")).toThrow("Unsafe storage filename");
    await mkdir(path.join(root, "uploads", "folder"));
    await expect(storage.openFile("uploads", "folder")).rejects.toThrow("not a regular file");
  });

  // Windows developer shells commonly lack symlink privileges; Ubuntu CI executes this real symlink case.
  it.runIf(process.platform !== "win32")(
    "rejects symlinked files on platforms with unprivileged symlink support",
    async () => {
      const { root, storage } = await makeStorage();
      const outsideDir = await mkdtemp(path.join(os.tmpdir(), "web-video-outside-"));
      tempDirs.push(outsideDir);
      const outside = path.join(outsideDir, "outside.mp4");
      await writeFile(outside, "video");
      await symlink(outside, path.join(root, "uploads", "linked.mp4"));

      await expect(storage.openFile("uploads", "linked.mp4")).rejects.toThrow("symlink");
    }
  );

  it("prunes managed directories while preserving kept files", async () => {
    const { root, storage } = await makeStorage();
    const keep = path.join(root, "outputs", "keep.mp4");
    const remove = path.join(root, "outputs", "remove.mp4");
    await mkdir(path.dirname(keep), { recursive: true });
    await writeFile(keep, "keep");
    await writeFile(remove, "remove");

    await storage.pruneDirectory("outputs", new Set([keep, path.join(root, "outputs", "missing.mp4")]));

    await expect(storage.openFile("outputs", keep)).resolves.toMatchObject({ size: 4 });
    await expect(storage.openFile("outputs", remove)).rejects.toThrow();
  });

  it("moves and removes contained files without following external keep paths", async () => {
    const { root, storage } = await makeStorage();
    const staged = path.join(root, "tmp", "upload-staging", "candidate");
    const external = path.join(root, "..", "external.mp4");
    await writeFile(staged, "video");
    await writeFile(external, "external");

    await storage.moveContained("upload-staging", staged, "uploads", "source.mp4");
    await expect(storage.openFile("uploads", "source.mp4")).resolves.toMatchObject({ size: 5 });
    await expect(storage.pruneDirectory("uploads", new Set([external]))).rejects.toThrow("Keep path escapes uploads");
    await expect(storage.openFile("uploads", "source.mp4")).resolves.toMatchObject({ size: 5 });

    await storage.removeFile("uploads", "source.mp4");
    await expect(storage.openFile("uploads", "source.mp4")).rejects.toThrow();
  });
});
