import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";

export function createReadinessRouter(runtime: ApiRuntime): Router {
  const router = Router();
  router.get(
    "/ready",
    asyncHandler(async (_req, res) => {
      const readiness = await runtime.getReadiness();
      res.status(readiness.state === "not_ready" ? 503 : 200).json(readiness);
    })
  );
  return router;
}
