import express from "express";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiConfig } from "../config.js";
import { errorHandler } from "../middleware/error-handler.js";
import { insufficientStorageForOperation } from "../storage/storage-capacity.js";
import type { StoragePolicyService } from "../storage/storage-policy-service.js";
import { createUploadMiddleware } from "./create-upload-middleware.js";

const tempDirs: string[] = [];

function fakePolicy(options: {
  safeLimit: number;
  rejectReserve?: boolean;
  rejectPostStage?: boolean;
  onRelease?: () => void;
}) {
  return {
    getSafeUploadLimit: vi.fn(async () => options.safeLimit),
    assertCanAllocate: vi.fn(async () => {
      if (options.rejectPostStage) throw insufficientStorageForOperation("upload");
    }),
    reserve: vi.fn(async () => {
      if (options.rejectReserve) throw new Error("reservation failed");
      return { release: options.onRelease ?? vi.fn() };
    })
  } as unknown as StoragePolicyService;
}

async function makeApp(
  limit = 1024,
  storagePolicy?: StoragePolicyService
): Promise<{ app: express.Express; stagingDir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-video-upload-mw-"));
  tempDirs.push(root);
  const stagingDir = path.join(root, "tmp", "upload-staging");
  await mkdir(stagingDir, { recursive: true });
  const upload = createUploadMiddleware(
    { uploadStagingDir: stagingDir, uploadFileSizeLimitBytes: limit } as ApiConfig,
    storagePolicy
  );
  const app = express();
  app.post("/upload", upload, (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Missing video file" });
      return;
    }
    res.json({ originalName: req.file.originalname, pathInsideStaging: req.file.path.startsWith(stagingDir) });
  });
  app.use(errorHandler);
  return { app, stagingDir };
}

async function stagedEntries(stagingDir: string): Promise<string[]> {
  return readdir(stagingDir).catch(() => []);
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("createUploadMiddleware", () => {
  it("accepts one video file into disk staging", async () => {
    const { app, stagingDir } = await makeApp();

    const response = await request(app).post("/upload").attach("video", Buffer.from("video"), "clip.mp4").expect(200);

    expect(response.body).toMatchObject({ originalName: "clip.mp4", pathInsideStaging: true });
    expect(await stagedEntries(stagingDir)).toHaveLength(1);
  });

  it("rejects missing, wrong, multiple, extra-field, oversized, and malformed multipart requests", async () => {
    const { app, stagingDir } = await makeApp(5);

    await request(app).post("/upload").expect(400, { error: "Missing video file" });
    const wrongField = await request(app).post("/upload").attach("file", Buffer.from("video"), "clip.mp4").expect(400);
    expect(wrongField.body).toMatchObject({ code: "UPLOAD_UNEXPECTED_FILE" });
    await request(app)
      .post("/upload")
      .attach("video", Buffer.from("one"), "one.mp4")
      .attach("video", Buffer.from("two"), "two.mp4")
      .expect(400)
      .expect((response) => expect(response.body).toMatchObject({ code: "UPLOAD_UNEXPECTED_FILE" }));
    await request(app)
      .post("/upload")
      .field("caption", "extra")
      .attach("video", Buffer.from("video"), "clip.mp4")
      .expect(400, { error: "Invalid multipart upload.", code: "UPLOAD_INVALID_MULTIPART" });
    await request(app)
      .post("/upload")
      .attach("video", Buffer.from("too large"), "large.mp4")
      .expect(413, { error: "Uploaded file is too large.", code: "UPLOAD_TOO_LARGE" });
    await request(app)
      .post("/upload")
      .set("Content-Type", "multipart/form-data; boundary=broken")
      .send("--broken\r\n")
      .expect(400, { error: "Invalid multipart upload.", code: "UPLOAD_INVALID_MULTIPART" });

    expect(await stagedEntries(stagingDir)).toHaveLength(0);
  });

  it("uses dynamic storage allowance and releases upload reservations", async () => {
    const release = vi.fn();
    const policy = fakePolicy({ safeLimit: 1000, onRelease: release });
    const { app, stagingDir } = await makeApp(1000, policy);

    await request(app).post("/upload").attach("video", Buffer.from("video"), "clip.mp4").expect(200);

    expect(policy.getSafeUploadLimit).toHaveBeenCalledWith(1000);
    expect(policy.reserve).toHaveBeenCalledWith({ operation: "upload", requiredBytes: 1000 });
    expect(policy.assertCanAllocate).toHaveBeenCalledWith({ operation: "upload", requiredBytes: 0 });
    expect(release).toHaveBeenCalled();
    expect(await stagedEntries(stagingDir)).toHaveLength(1);
  });

  it("returns 507 for current capacity exhaustion while preserving configured 413 upload-limit errors", async () => {
    const noRoom = await makeApp(100, fakePolicy({ safeLimit: 0 }));
    await request(noRoom.app)
      .post("/upload")
      .attach("video", Buffer.from("video"), "clip.mp4")
      .expect(507)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: "INSUFFICIENT_STORAGE" });
      });
    expect(await stagedEntries(noRoom.stagingDir)).toHaveLength(0);

    const dynamicTooSmall = await makeApp(100, fakePolicy({ safeLimit: 4 }));
    await request(dynamicTooSmall.app)
      .post("/upload")
      .attach("video", Buffer.from("video"), "clip.mp4")
      .expect(507)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: "INSUFFICIENT_STORAGE" });
      });
    expect(await stagedEntries(dynamicTooSmall.stagingDir)).toHaveLength(0);

    const configuredTooSmall = await makeApp(4);
    await request(configuredTooSmall.app)
      .post("/upload")
      .attach("video", Buffer.from("video"), "clip.mp4")
      .expect(413)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: "UPLOAD_TOO_LARGE" });
      });

    const configuredTooSmallWithPolicy = await makeApp(4, fakePolicy({ safeLimit: 4 }));
    await request(configuredTooSmallWithPolicy.app)
      .post("/upload")
      .attach("video", Buffer.from("video"), "clip.mp4")
      .expect(413)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: "UPLOAD_TOO_LARGE" });
      });

    const postStageCapacity = await makeApp(100, fakePolicy({ safeLimit: 100, rejectPostStage: true }));
    await request(postStageCapacity.app)
      .post("/upload")
      .attach("video", Buffer.from("video"), "clip.mp4")
      .expect(507)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: "INSUFFICIENT_STORAGE" });
      });
    expect(await stagedEntries(postStageCapacity.stagingDir)).toHaveLength(0);
  });
});
