import cors from "cors";
import express from "express";
import type multer from "multer";
import type { ApiConfig } from "./config.js";
import { errorHandler } from "./middleware/error-handler.js";
import { registerRoutes } from "./routes/index.js";
import type { ApiRuntime } from "./runtime/api-runtime.js";

export type CreateAppDependencies = {
  config: Pick<ApiConfig, "corsOrigin">;
  runtime: ApiRuntime;
  upload: multer.Multer;
};

export function createApp(dependencies: CreateAppDependencies): express.Express {
  const app = express();

  app.use(cors({ origin: dependencies.config.corsOrigin }));
  app.use(express.json({ limit: "5mb" }));
  registerRoutes(app, { runtime: dependencies.runtime, upload: dependencies.upload });
  app.use(errorHandler);

  return app;
}
