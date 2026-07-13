import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";

export function createHistoryRouter(runtime: ApiRuntime): Router {
  const router = Router();

  router.get("/api/history", (_req, res) => {
    res.json(runtime.getHistory());
  });

  router.post(
    "/api/history/delete",
    asyncHandler(async (req, res) => {
      const videoIds = Array.isArray(req.body?.videoIds) ? (req.body.videoIds as string[]) : [];
      const jobIds = Array.isArray(req.body?.jobIds) ? (req.body.jobIds as string[]) : [];
      res.json(await runtime.deleteHistory(videoIds, jobIds));
    })
  );

  return router;
}
