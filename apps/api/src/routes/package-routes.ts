import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";

export function createPackageRouter(runtime: ApiRuntime): Router {
  const router = Router();

  router.post(
    "/api/videos/:id/package",
    asyncHandler(async (req, res) => {
      const result = await runtime.createPackageJob(req.params.id, req.body);
      if (!result.job) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(result.status).json(result.job);
    })
  );

  return router;
}
