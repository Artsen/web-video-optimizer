import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireJsonBody } from "../middleware/require-json.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";
import { IdParamsSchema, PackageRequestBodySchema } from "../validation/api-schemas.js";
import { parseRequest } from "../validation/request-validation.js";

export function createPackageRouter(runtime: ApiRuntime): Router {
  const router = Router();

  router.post(
    "/api/videos/:id/package",
    requireJsonBody,
    asyncHandler(async (req, res) => {
      const { params, body } = parseRequest({ params: IdParamsSchema, body: PackageRequestBodySchema }, req);
      const result = await runtime.createPackageJob(params.id, body);
      if (!result.job) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(result.status).json(result.job);
    })
  );

  return router;
}
