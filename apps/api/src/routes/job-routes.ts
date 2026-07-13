import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";
import { streamFile } from "./stream-file.js";

export function createJobRouter(runtime: ApiRuntime): Router {
  const router = Router();

  router.post("/api/videos/:id/jobs", (req, res) => {
    const result = runtime.createOptimizationJob(req.params.id, req.body ?? {});
    if (!result.job) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.status(result.status).json(result.job);
  });

  router.post("/api/videos/:id/sample", (req, res) => {
    const result = runtime.createSampleJob(req.params.id, req.body ?? {}, req.body?.sampleSeconds);
    if (!result.job) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.status(result.status).json(result.job);
  });

  router.post("/api/videos/:id/poster", (req, res) => {
    const job = runtime.createPosterJob(req.params.id, req.body?.atSeconds);
    if (!job) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.status(202).json(job);
  });

  router.post("/api/videos/:id/pair", (req, res) => {
    const result = runtime.createPairJobs(req.params.id);
    if (!result) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.status(202).json(result);
  });

  router.get("/api/jobs/:id", (req, res) => {
    const job = runtime.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  });

  router.patch(
    "/api/jobs/:id",
    asyncHandler(async (req, res) => {
      const nextName = String(req.body?.outputFileName ?? "").trim();
      if (!nextName) {
        res.status(400).json({ error: "Enter an output filename." });
        return;
      }

      const job = await runtime.renameJob(req.params.id, nextName);
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
      const job = await runtime.cancelJob(req.params.id);
      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      res.json(job);
    })
  );

  router.get("/api/jobs/:id/events", (req, res) => {
    if (!runtime.getJob(req.params.id)) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = () => {
      const job = runtime.getJob(req.params.id);
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
    const descriptor = runtime.getJobDownload(req.params.id);
    if (!descriptor) {
      res.status(404).json({ error: "Output not available" });
      return;
    }
    res.download(descriptor.filePath, descriptor.fileName);
  });

  router.get("/api/jobs/:id/sidecar", (req, res) => {
    const descriptor = runtime.getJobSidecar(req.params.id);
    if (!descriptor) {
      res.status(404).json({ error: "Sidecar output not available" });
      return;
    }
    res.download(descriptor.filePath, descriptor.fileName);
  });

  router.post(
    "/api/jobs/:id/reveal",
    asyncHandler(async (req, res) => {
      if (!(await runtime.revealJob(req.params.id))) {
        res.status(404).json({ error: "Output not available" });
        return;
      }
      res.json({ ok: true });
    })
  );

  router.get(
    "/api/jobs/:id/output",
    asyncHandler(async (req, res) => {
      const descriptor = runtime.getJobOutput(req.params.id);
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
      if (!(await runtime.deleteJob(req.params.id))) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      res.status(204).end();
    })
  );

  return router;
}
