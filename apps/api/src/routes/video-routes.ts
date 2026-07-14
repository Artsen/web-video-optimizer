import { Router } from "express";
import type { RequestHandler } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireJsonBody } from "../middleware/require-json.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";
import { IdParamsSchema, RenameVideoBodySchema } from "../validation/api-schemas.js";
import { parseParams, parseRequest } from "../validation/request-validation.js";
import { streamFile } from "./stream-file.js";

export function createVideoRouter(runtime: ApiRuntime, upload: RequestHandler): Router {
  const router = Router();

  router.post(
    "/api/videos",
    upload,
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
      const params = parseParams(IdParamsSchema, req);
      const descriptor = runtime.getVideoSource(params.id);
      if (!descriptor) {
        res.status(404).json({ error: "Video not found" });
        return;
      }
      await streamFile(req, res, descriptor, "inline");
    })
  );

  router.get(
    "/api/videos/:id/download",
    asyncHandler(async (req, res) => {
      const params = parseParams(IdParamsSchema, req);
      const descriptor = runtime.getVideoDownload(params.id);
      if (!descriptor) {
        res.status(404).json({ error: "Source video not found" });
        return;
      }
      await streamFile(req, res, descriptor, "attachment");
    })
  );

  router.patch(
    "/api/videos/:id",
    requireJsonBody,
    asyncHandler(async (req, res) => {
      const { params, body } = parseRequest({ params: IdParamsSchema, body: RenameVideoBodySchema }, req);

      const record = await runtime.renameVideo(params.id, body.originalName);
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
      const params = parseParams(IdParamsSchema, req);
      if (!(await runtime.deleteVideo(params.id))) {
        res.status(404).json({ error: "Video not found" });
        return;
      }
      res.status(204).end();
    })
  );

  return router;
}
