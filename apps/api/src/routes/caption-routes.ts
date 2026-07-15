import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireJsonBody } from "../middleware/require-json.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";
import { captionUpdateBodySchema, IdParamsSchema, SubtitleJobIdBodySchema } from "../validation/api-schemas.js";
import { parseParams, parseRequest } from "../validation/request-validation.js";

export function createCaptionRouter(runtime: ApiRuntime, options: { jsonBodyLimitBytes: number }): Router {
  const router = Router();

  router.post(
    "/api/videos/:id/subtitles",
    asyncHandler(async (req, res) => {
      const params = parseParams(IdParamsSchema, req);
      const result = await runtime.createSubtitleJob(params.id);
      if (!result.job) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(result.status).json(result.job);
    })
  );

  router.get(
    "/api/jobs/:id/captions",
    asyncHandler(async (req, res) => {
      const params = parseParams(IdParamsSchema, req);
      const captions = await runtime.getCaptions(params.id);
      if (!captions) {
        res.status(404).json({ error: "Caption output not available" });
        return;
      }
      res.json(captions);
    })
  );

  router.put(
    "/api/jobs/:id/captions",
    requireJsonBody,
    asyncHandler(async (req, res) => {
      const { params, body } = parseRequest(
        { params: IdParamsSchema, body: captionUpdateBodySchema(options.jsonBodyLimitBytes) },
        req
      );
      const job = await runtime.updateCaptions(params.id, body.vtt);
      if (!job) {
        res.status(404).json({ error: "Caption output not available" });
        return;
      }
      res.json(job);
    })
  );

  router.post(
    "/api/jobs/:id/mux-subtitles",
    requireJsonBody,
    asyncHandler(async (req, res) => {
      const { params, body } = parseRequest({ params: IdParamsSchema, body: SubtitleJobIdBodySchema }, req);
      const result = await runtime.createMuxSubtitleJob(params.id, body.subtitleJobId);
      if (!result.job) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(result.status).json(result.job);
    })
  );

  return router;
}
