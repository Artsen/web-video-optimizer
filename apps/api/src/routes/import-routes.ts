import { Router } from "express";
import { ApiError } from "../errors/api-error.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireJsonBody } from "../middleware/require-json.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";
import { ImportUrlBodySchema } from "../validation/api-schemas.js";
import { validationError } from "../validation/validation-error.js";

export function createImportRouter(runtime: ApiRuntime): Router {
  const router = Router();

  router.post(
    "/api/videos/url",
    requireJsonBody,
    asyncHandler(async (req, res) => {
      const result = ImportUrlBodySchema.safeParse(req.body);
      if (!result.success) {
        const error = validationError(result.error);
        throw new ApiError(error.status, error.code, "Enter a valid YouTube URL.", error.details);
      }

      res.json(await runtime.createVideoFromUrl(result.data.url));
    })
  );

  return router;
}
