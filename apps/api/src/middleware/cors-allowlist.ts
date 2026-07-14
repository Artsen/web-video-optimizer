import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../errors/api-error.js";

const allowedMethods = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const allowedHeaders = "Content-Type,Range";

export function corsAllowlist(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.header("Origin");
    if (!origin) {
      next();
      return;
    }

    if (!allowed.has(origin)) {
      next(new ApiError(403, "CORS_ORIGIN_DENIED", "Origin is not allowed."));
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", allowedMethods);
    res.setHeader("Access-Control-Allow-Headers", allowedHeaders);

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}
