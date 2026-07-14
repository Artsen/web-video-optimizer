import express from "express";
import type { RequestHandler } from "express";
import type { ApiConfig } from "./config.js";
import { apiNotFound } from "./middleware/api-not-found.js";
import { apiSecurityHeaders } from "./middleware/api-security-headers.js";
import { corsAllowlist } from "./middleware/cors-allowlist.js";
import { errorHandler } from "./middleware/error-handler.js";
import { registerRoutes } from "./routes/index.js";
import type { ApiRuntime } from "./runtime/api-runtime.js";

export type CreateAppDependencies = {
  config: Pick<ApiConfig, "corsOrigins" | "jsonBodyLimitBytes">;
  runtime: ApiRuntime;
  upload: RequestHandler;
};

export function createApp(dependencies: CreateAppDependencies): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(apiSecurityHeaders);
  app.use(corsAllowlist(dependencies.config.corsOrigins));
  app.use(express.json({ limit: dependencies.config.jsonBodyLimitBytes }));
  registerRoutes(app, { config: dependencies.config, runtime: dependencies.runtime, upload: dependencies.upload });
  app.use(apiNotFound);
  app.use(errorHandler);

  return app;
}
