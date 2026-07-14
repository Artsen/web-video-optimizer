import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireJsonBody } from "../middleware/require-json.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";
import { HistoryDeleteBodySchema } from "../validation/api-schemas.js";
import { parseBody } from "../validation/request-validation.js";

export function createHistoryRouter(runtime: ApiRuntime): Router {
  const router = Router();

  router.get("/api/history", (_req, res) => {
    res.json(runtime.getHistory());
  });

  router.post(
    "/api/history/delete",
    requireJsonBody,
    asyncHandler(async (req, res) => {
      const body = parseBody(HistoryDeleteBodySchema, req);
      res.json(await runtime.deleteHistory(body.videoIds, body.jobIds));
    })
  );

  return router;
}
