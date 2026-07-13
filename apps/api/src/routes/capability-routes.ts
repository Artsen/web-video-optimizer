import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";

export function createCapabilityRouter(runtime: ApiRuntime): Router {
  const router = Router();
  router.get(
    "/api/capabilities",
    asyncHandler(async (_req, res) => {
      res.json(await runtime.getCapabilities());
    })
  );
  return router;
}
