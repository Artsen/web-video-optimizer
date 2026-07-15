import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";

export function createStorageRouter(runtime: ApiRuntime): Router {
  const router = Router();

  router.get(
    "/api/storage",
    asyncHandler(async (_req, res) => {
      res.json(await runtime.getStorageStatus());
    })
  );

  router.post(
    "/api/storage/cleanup",
    asyncHandler(async (_req, res) => {
      res.json(await runtime.cleanupStorage());
    })
  );

  return router;
}
