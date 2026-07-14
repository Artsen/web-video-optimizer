import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireJsonBody } from "../middleware/require-json.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";
import {
  IdParamsSchema,
  OptimizationRequestBodySchema,
  PosterRequestBodySchema,
  RenameJobBodySchema,
  SampleRequestBodySchema
} from "../validation/api-schemas.js";
import { parseBody, parseParams, parseRequest } from "../validation/request-validation.js";
import { streamFile } from "./stream-file.js";

export function createJobRouter(runtime: ApiRuntime): Router {
  const router = Router();

  router.post("/api/videos/:id/jobs", requireJsonBody, (req, res) => {
    const { params, body } = parseRequest({ params: IdParamsSchema, body: OptimizationRequestBodySchema }, req);
    const result = runtime.createOptimizationJob(params.id, body);
    if (!result.job) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.status(result.status).json(result.job);
  });

  router.post("/api/videos/:id/sample", requireJsonBody, (req, res) => {
    const { params, body } = parseRequest({ params: IdParamsSchema, body: SampleRequestBodySchema }, req);
    const { sampleSeconds, ...settings } = body;
    const result = runtime.createSampleJob(params.id, settings, sampleSeconds);
    if (!result.job) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.status(result.status).json(result.job);
  });

  router.post("/api/videos/:id/poster", requireJsonBody, (req, res) => {
    const { params, body } = parseRequest({ params: IdParamsSchema, body: PosterRequestBodySchema }, req);
    const job = runtime.createPosterJob(params.id, body.atSeconds);
    if (!job) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.status(202).json(job);
  });

  router.post("/api/videos/:id/pair", (req, res) => {
    const params = parseParams(IdParamsSchema, req);
    if (req.body && Object.keys(req.body as Record<string, unknown>).length > 0) {
      parseBody(OptimizationRequestBodySchema, req);
    }
    const result = runtime.createPairJobs(params.id);
    if (!result) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.status(202).json(result);
  });

  router.get("/api/jobs/:id", (req, res) => {
    const params = parseParams(IdParamsSchema, req);
    const job = runtime.getJob(params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  });

  router.patch(
    "/api/jobs/:id",
    requireJsonBody,
    asyncHandler(async (req, res) => {
      const { params, body } = parseRequest({ params: IdParamsSchema, body: RenameJobBodySchema }, req);

      const job = await runtime.renameJob(params.id, body.outputFileName);
      if (!job) {
        res.status(404).json({ error: "Job output not found" });
        return;
      }
      res.json(job);
    })
  );

  router.post(
    "/api/jobs/:id/cancel",
    asyncHandler(async (req, res) => {
      const params = parseParams(IdParamsSchema, req);
      const job = await runtime.cancelJob(params.id);
      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      res.json(job);
    })
  );

  router.get("/api/jobs/:id/events", (req, res) => {
    const params = parseParams(IdParamsSchema, req);
    if (!runtime.getJob(params.id)) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = () => {
      const job = runtime.getJob(params.id);
      if (!job) {
        clearInterval(interval);
        res.end();
        return;
      }
      res.write(`data: ${JSON.stringify(job)}\n\n`);
      if (job.status === "completed" || job.status === "failed" || job.status === "canceled") {
        clearInterval(interval);
        res.end();
      }
    };

    const interval = setInterval(send, 1000);
    send();
    req.on("close", () => clearInterval(interval));
  });

  router.get("/api/jobs/:id/download", (req, res) => {
    const params = parseParams(IdParamsSchema, req);
    const descriptor = runtime.getJobDownload(params.id);
    if (!descriptor) {
      res.status(404).json({ error: "Output not available" });
      return;
    }
    res.download(descriptor.filePath, descriptor.fileName);
  });

  router.get("/api/jobs/:id/sidecar", (req, res) => {
    const params = parseParams(IdParamsSchema, req);
    const descriptor = runtime.getJobSidecar(params.id);
    if (!descriptor) {
      res.status(404).json({ error: "Sidecar output not available" });
      return;
    }
    res.download(descriptor.filePath, descriptor.fileName);
  });

  router.post(
    "/api/jobs/:id/reveal",
    asyncHandler(async (req, res) => {
      const params = parseParams(IdParamsSchema, req);
      if (!(await runtime.revealJob(params.id))) {
        res.status(404).json({ error: "Output not available" });
        return;
      }
      res.json({ ok: true });
    })
  );

  router.get(
    "/api/jobs/:id/output",
    asyncHandler(async (req, res) => {
      const params = parseParams(IdParamsSchema, req);
      const descriptor = runtime.getJobOutput(params.id);
      if (!descriptor) {
        res.status(404).json({ error: "Output not available" });
        return;
      }
      await streamFile(req, res, descriptor, "inline");
    })
  );

  router.delete(
    "/api/jobs/:id",
    asyncHandler(async (req, res) => {
      const params = parseParams(IdParamsSchema, req);
      if (!(await runtime.deleteJob(params.id))) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      res.status(204).end();
    })
  );

  return router;
}
