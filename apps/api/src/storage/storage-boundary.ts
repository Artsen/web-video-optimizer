import fs from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { FileHandle } from "node:fs/promises";
import { StorageBoundaryError } from "./storage-error.js";

export type StorageArea = "uploads" | "outputs" | "tmp" | "upload-staging";

export type StorageRoots = Record<StorageArea, string> & {
  root: string;
};

export type OpenedStoredFile = {
  handle: FileHandle;
  size: number;
  path: string;
};

const removeOptions = { force: true, maxRetries: 5, retryDelay: 150 };

function assertNoNul(value: string): void {
  if (value.includes("\0")) throw new StorageBoundaryError("Path contains NUL");
}

export function isPathInside(root: string, candidate: string): boolean {
  assertNoNul(root);
  assertNoNul(candidate);
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

async function realpathIfExists(target: string): Promise<string | undefined> {
  try {
    return await fs.promises.realpath(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export class StorageBoundary {
  readonly roots: StorageRoots;
  #canonicalAreas = new Map<StorageArea, string>();

  constructor(roots: StorageRoots) {
    this.roots = {
      root: path.resolve(roots.root),
      uploads: path.resolve(roots.uploads),
      outputs: path.resolve(roots.outputs),
      tmp: path.resolve(roots.tmp),
      "upload-staging": path.resolve(roots["upload-staging"])
    };
  }

  async initialize(): Promise<void> {
    await fs.promises.mkdir(this.roots.root, { recursive: true });
    for (const area of this.areaNames()) await fs.promises.mkdir(this.roots[area], { recursive: true });
    const root = await this.verifyDirectory(this.roots.root, "storage root");
    for (const area of this.areaNames()) {
      if (!isPathInside(this.roots.root, this.roots[area])) {
        throw new StorageBoundaryError(`${area} directory is outside storage root`);
      }
      const canonical = await this.verifyDirectory(this.roots[area], area);
      if (!isPathInside(root, canonical)) {
        throw new StorageBoundaryError(`${area} directory resolves outside storage root`);
      }
      this.#canonicalAreas.set(area, canonical);
    }
  }

  pathFor(area: StorageArea, fileName: string): string {
    if (
      path.basename(fileName) !== fileName ||
      fileName.includes("/") ||
      fileName.includes("\\") ||
      fileName.includes("\0")
    ) {
      throw new StorageBoundaryError("Unsafe storage filename");
    }
    return this.targetPath(area, fileName);
  }

  targetPath(area: StorageArea, candidate: string): string {
    const root = this.roots[area];
    const resolved = path.resolve(root, candidate);
    if (!isPathInside(root, resolved) || resolved === root) {
      throw new StorageBoundaryError(`Path escapes ${area}`);
    }
    return resolved;
  }

  async assertExistingRegularFile(area: StorageArea, candidate: string): Promise<string> {
    const resolved = this.targetPath(area, candidate);
    const lstat = await fs.promises.lstat(resolved);
    if (lstat.isSymbolicLink()) throw new StorageBoundaryError("Stored file is a symlink");
    if (!lstat.isFile()) throw new StorageBoundaryError("Stored path is not a regular file");
    const canonical = await fs.promises.realpath(resolved);
    const root = await this.canonicalArea(area);
    if (!isPathInside(root, canonical)) throw new StorageBoundaryError(`Stored file resolves outside ${area}`);
    return resolved;
  }

  async validateCandidate(
    area: StorageArea,
    candidate: string,
    maxBytes: number
  ): Promise<{ path: string; size: number }> {
    const resolved = await this.assertExistingRegularFile(area, candidate);
    const opened = await open(resolved, "r");
    try {
      const fileStat = await opened.stat();
      if (!fileStat.isFile()) throw new StorageBoundaryError("Stored path is not a regular file");
      if (fileStat.size <= 0) throw new StorageBoundaryError("Uploaded file is empty");
      if (fileStat.size > maxBytes) throw new StorageBoundaryError("Uploaded file is too large");
      return { path: resolved, size: fileStat.size };
    } finally {
      await opened.close();
    }
  }

  async moveContained(fromArea: StorageArea, fromPath: string, toArea: StorageArea, toPath: string): Promise<void> {
    const source = await this.assertExistingRegularFile(fromArea, fromPath);
    const destination = this.targetPath(toArea, toPath);
    const parent = path.dirname(destination);
    if (!isPathInside(this.roots[toArea], parent)) throw new StorageBoundaryError("Destination escapes storage area");
    await rename(source, destination);
  }

  async removeFile(area: StorageArea, candidate: string): Promise<void> {
    const resolved = this.targetPath(area, candidate);
    const lstat = await fs.promises.lstat(resolved).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!lstat) return;
    if (lstat.isDirectory()) throw new StorageBoundaryError("Refusing to remove directory as file");
    await rm(resolved, removeOptions);
  }

  async removeTree(area: StorageArea, candidate: string): Promise<void> {
    const resolved = this.targetPath(area, candidate);
    await rm(resolved, { recursive: true, ...removeOptions });
  }

  async openFile(area: StorageArea, candidate: string): Promise<OpenedStoredFile> {
    const resolved = await this.assertExistingRegularFile(area, candidate);
    const handle = await open(resolved, "r");
    try {
      const fileStat = await handle.stat();
      if (!fileStat.isFile()) throw new StorageBoundaryError("Stored path is not a regular file");
      return { handle, size: fileStat.size, path: resolved };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  async fileExists(area: StorageArea, candidate: string): Promise<boolean> {
    try {
      await this.assertExistingRegularFile(area, candidate);
      return true;
    } catch {
      return false;
    }
  }

  async pruneDirectory(area: StorageArea, keepPaths: Set<string>): Promise<void> {
    await fs.promises.mkdir(this.roots[area], { recursive: true });
    const root = await this.canonicalArea(area);
    for (const keepPath of keepPaths) {
      const real = await realpathIfExists(keepPath);
      if (!real) continue;
      if (!isPathInside(root, real)) {
        throw new StorageBoundaryError(`Keep path escapes ${area}`);
      }
    }
    const entries = await fs.promises.readdir(this.roots[area], { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(this.roots[area], entry.name);
        const resolved = path.resolve(fullPath);
        if (keepPaths.has(resolved)) return;
        if (entry.isSymbolicLink()) {
          await rm(fullPath, removeOptions);
          return;
        }
        await rm(fullPath, { recursive: entry.isDirectory(), ...removeOptions });
      })
    );
  }

  private areaNames(): StorageArea[] {
    return ["uploads", "outputs", "tmp", "upload-staging"];
  }

  private async canonicalArea(area: StorageArea): Promise<string> {
    const existing = this.#canonicalAreas.get(area);
    if (existing) return existing;
    return this.verifyDirectory(this.roots[area], area);
  }

  private async verifyDirectory(directory: string, label: string): Promise<string> {
    const lstat = await fs.promises.lstat(directory);
    if (lstat.isSymbolicLink()) throw new StorageBoundaryError(`${label} must not be a symlink`);
    if (!lstat.isDirectory()) throw new StorageBoundaryError(`${label} must be a directory`);
    return fs.promises.realpath(directory);
  }
}
