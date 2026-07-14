import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../errors/api-error.js";

export function apiNotFound(req: Request, _res: Response, next: NextFunction): void {
  if (req.path.startsWith("/api/")) {
    next(new ApiError(404, "NOT_FOUND", "API route not found"));
    return;
  }

  next();
}
