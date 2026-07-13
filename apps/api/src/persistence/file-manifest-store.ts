import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { ManifestSnapshot } from "../entities/manifest.js";
import type { ManifestLoadResult, ManifestSource, ManifestStore } from "./manifest-store.js";
import { validateManifestSnapshot } from "./manifest-validation.js";

export class ManifestLoadError extends Error {
  constructor(
    message: string,
    readonly primaryError?: unknown,
    readonly backupError?: unknown
  ) {
    super(message);
    this.name = "ManifestLoadError";
  }
}

export class FileManifestStore implements ManifestStore {
  readonly backupPath: string;

  constructor(readonly manifestPath: string) {
    this.backupPath = `${manifestPath}.bak`;
  }

  async load(): Promise<ManifestLoadResult> {
    const primary = await this.readSnapshot(this.manifestPath, "primary");
    if (primary.kind === "loaded") {
      return {
        kind: "loaded",
        snapshot: primary.snapshot,
        source: "primary",
        recoveredFromBackup: false
      };
    }

    const backup = await this.readSnapshot(this.backupPath, "backup");
    if (backup.kind === "loaded") {
      if (primary.kind === "invalid") {
        console.warn("Primary manifest is invalid; recovered state from backup manifest.");
      } else {
        console.warn("Primary manifest is missing; recovered state from backup manifest.");
      }
      return {
        kind: "loaded",
        snapshot: backup.snapshot,
        source: "backup",
        recoveredFromBackup: true
      };
    }

    if (primary.kind === "missing" && backup.kind === "missing") {
      return { kind: "missing" };
    }

    throw new ManifestLoadError(
      "Unable to load a valid manifest or backup manifest",
      primary.kind === "invalid" ? primary.error : undefined,
      backup.kind === "invalid" ? backup.error : undefined
    );
  }

  async save(snapshot: ManifestSnapshot): Promise<void> {
    const directory = path.dirname(this.manifestPath);
    const primaryTempPath = this.tempPath(directory, "manifest");
    let backupTempPath: string | undefined;

    try {
      await this.writeFileDurably(primaryTempPath, JSON.stringify(snapshot, null, 2));
      const existingPrimary = await this.readSnapshot(this.manifestPath, "primary");
      if (existingPrimary.kind === "loaded") {
        backupTempPath = this.tempPath(directory, "manifest-backup");
        await this.writeFileDurably(backupTempPath, JSON.stringify(existingPrimary.snapshot, null, 2));
        await fs.promises.rename(backupTempPath, this.backupPath);
        backupTempPath = undefined;
      }
      await fs.promises.rename(primaryTempPath, this.manifestPath);
    } finally {
      await Promise.all([
        fs.promises.rm(primaryTempPath, { force: true }),
        backupTempPath ? fs.promises.rm(backupTempPath, { force: true }) : Promise.resolve()
      ]);
    }
  }

  private async readSnapshot(
    filePath: string,
    source: ManifestSource
  ): Promise<
    | { kind: "missing" }
    | { kind: "loaded"; snapshot: ManifestSnapshot; source: ManifestSource }
    | { kind: "invalid"; error: unknown; source: ManifestSource }
  > {
    try {
      const raw = await fs.promises.readFile(filePath, "utf8");
      return { kind: "loaded", snapshot: validateManifestSnapshot(JSON.parse(raw)), source };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
      return { kind: "invalid", error, source };
    }
  }

  private tempPath(directory: string, label: string): string {
    return path.join(directory, `.${path.basename(this.manifestPath)}.${label}.${process.pid}.${nanoid()}.tmp`);
  }

  private async writeFileDurably(filePath: string, contents: string): Promise<void> {
    const handle = await fs.promises.open(filePath, "w");
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}
