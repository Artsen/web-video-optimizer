import type { Express, RequestHandler } from "express";
import type { ApiConfig } from "../config.js";
import type { ApiRuntime } from "../runtime/api-runtime.js";
import { createCapabilityRouter } from "./capability-routes.js";
import { createCaptionRouter } from "./caption-routes.js";
import { createHealthRouter } from "./health-routes.js";
import { createHistoryRouter } from "./history-routes.js";
import { createImportRouter } from "./import-routes.js";
import { createJobRouter } from "./job-routes.js";
import { createPackageRouter } from "./package-routes.js";
import { createVideoRouter } from "./video-routes.js";

export type RouteDependencies = {
  config: Pick<ApiConfig, "jsonBodyLimitBytes">;
  runtime: ApiRuntime;
  upload: RequestHandler;
};

export function registerRoutes(app: Express, dependencies: RouteDependencies): void {
  app.use(createHealthRouter());
  app.use(createCapabilityRouter(dependencies.runtime));
  app.use(createHistoryRouter(dependencies.runtime));
  app.use(createImportRouter(dependencies.runtime));
  app.use(createVideoRouter(dependencies.runtime, dependencies.upload));
  app.use(createJobRouter(dependencies.runtime));
  app.use(createCaptionRouter(dependencies.runtime, { jsonBodyLimitBytes: dependencies.config.jsonBodyLimitBytes }));
  app.use(createPackageRouter(dependencies.runtime));
}
