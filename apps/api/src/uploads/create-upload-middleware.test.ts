import express from "express";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiConfig } from "../config.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createUploadMiddleware } from "./create-upload-middleware.js";

const tempDirs: string[] = [];

async function makeApp(limit = 1024): Promise<{ app: express.Express; stagingDir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-video-upload-mw-"));
  tempDirs.push(root);
  const stagingDir = path.join(root, "tmp", "upload-staging");
  await mkdir(stagingDir, { recursive: true });
  const upload = createUploadMiddleware({ uploadStagingDir: stagingDir, uploadFileSizeLimitBytes: limit } as ApiConfig);
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
});
