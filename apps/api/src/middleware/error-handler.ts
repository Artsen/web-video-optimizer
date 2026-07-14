import type { ErrorRequestHandler } from "express";
import { ApiError, isApiError } from "../errors/api-error.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  void next;
  if (res.headersSent) {
    return;
  }

  if (isBodyParserError(error, "entity.parse.failed")) {
    res.status(400).json({ error: "Invalid JSON request body.", code: "INVALID_JSON" });
    return;
  }

  if (isBodyParserError(error, "entity.too.large")) {
    res.status(413).json({ error: "Request body is too large.", code: "REQUEST_TOO_LARGE" });
    return;
  }

  if (isApiError(error)) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {})
    });
    return;
  }

  console.error(error);
  const internal = new ApiError(500, "INTERNAL_ERROR", "Unexpected server error");
  res.status(internal.status).json({ error: internal.message, code: internal.code });
};

function isBodyParserError(error: unknown, type: string): error is { type: string } {
  return typeof error === "object" && error !== null && "type" in error && error.type === type;
}
