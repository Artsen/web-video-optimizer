import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../errors/api-error.js";

export function requireJsonBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.is("application/json")) {
    next();
    return;
  }

  next(new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."));
}
