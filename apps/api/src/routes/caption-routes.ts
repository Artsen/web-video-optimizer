import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";

export function createCaptionRouter(runtime: ApiRuntime): Router {
  const router = Router();

  router.post("/api/videos/:id/subtitles", (req, res) => {
    const result = runtime.createSubtitleJob(req.params.id);
    if (!result.job) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(result.status).json(result.job);
  });

  router.get(
    "/api/jobs/:id/captions",
    asyncHandler(async (req, res) => {
      const captions = await runtime.getCaptions(req.params.id);
      if (!captions) {
        res.status(404).json({ error: "Caption output not available" });
        return;
      }
      res.json(captions);
    })
  );

  router.put(
    "/api/jobs/:id/captions",
    asyncHandler(async (req, res) => {
      const job = await runtime.updateCaptions(req.params.id, String(req.body?.vtt ?? ""));
      if (!job) {
        res.status(404).json({ error: "Caption output not available" });
        return;
      }
      res.json(job);
    })
  );

  router.post("/api/jobs/:id/mux-subtitles", (req, res) => {
    const result = runtime.createMuxSubtitleJob(req.params.id, String(req.body?.subtitleJobId ?? ""));
    if (!result.job) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(result.status).json(result.job);
  });

  return router;
}
