import type multer from "multer";
import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";
import { streamFile } from "./stream-file.js";

export function createVideoRouter(runtime: ApiRuntime, upload: multer.Multer): Router {
  const router = Router();

  router.post(
    "/api/videos",
    upload.single("video"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: "Missing video file" });
        return;
      }

      res.json(
        await runtime.createVideoFromUpload({
          path: req.file.path,
          originalName: req.file.originalname,
          buffer: req.file.buffer
        })
      );
    })
  );

  router.get(
    "/api/videos/:id/source",
    asyncHandler(async (req, res) => {
      const descriptor = runtime.getVideoSource(req.params.id);
      if (!descriptor) {
        res.status(404).json({ error: "Video not found" });
        return;
      }
      await streamFile(req, res, descriptor, "inline");
    })
  );

  router.get("/api/videos/:id/download", (req, res) => {
    const descriptor = runtime.getVideoDownload(req.params.id);
    if (!descriptor) {
      res.status(404).json({ error: "Source video not found" });
      return;
    }
    res.download(descriptor.filePath, descriptor.fileName);
  });

  router.patch(
    "/api/videos/:id",
    asyncHandler(async (req, res) => {
      const nextName = String(req.body?.originalName ?? "").trim();
      if (!nextName) {
        res.status(400).json({ error: "Enter a source filename." });
        return;
      }

      const record = await runtime.renameVideo(req.params.id, nextName);
      if (!record) {
        res.status(404).json({ error: "Video not found" });
        return;
      }
      res.json(record);
    })
  );

  router.delete(
    "/api/videos/:id",
    asyncHandler(async (req, res) => {
      if (!(await runtime.deleteVideo(req.params.id))) {
        res.status(404).json({ error: "Video not found" });
        return;
      }
      res.status(204).end();
    })
  );

  return router;
}
