import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";

export function createImportRouter(runtime: ApiRuntime): Router {
  const router = Router();

  router.post(
    "/api/videos/url",
    asyncHandler(async (req, res) => {
      const url = String(req.body?.url ?? "").trim();
      if (!/^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(url)) {
        res.status(400).json({ error: "Enter a valid YouTube URL." });
        return;
      }

      res.json(await runtime.createVideoFromUrl(url));
    })
  );

  return router;
}
