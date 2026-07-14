import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ApiError, isApiError } from "../errors/api-error.js";
import { StorageBoundaryError } from "../storage/storage-error.js";

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

  if (error instanceof multer.MulterError) {
    const mapped = mapMulterError(error);
    res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    return;
  }

  if (isMultipartParserError(error)) {
    res.status(400).json({ error: "Invalid multipart upload.", code: "UPLOAD_INVALID_MULTIPART" });
    return;
  }

  if (error instanceof StorageBoundaryError) {
    res.status(404).json({ error: "Stored file not available.", code: "NOT_FOUND" });
    return;
  }

  console.error(error);
  const internal = new ApiError(500, "INTERNAL_ERROR", "Unexpected server error");
  res.status(internal.status).json({ error: internal.message, code: internal.code });
};

function isBodyParserError(error: unknown, type: string): error is { type: string } {
  return typeof error === "object" && error !== null && "type" in error && error.type === type;
}

function isMultipartParserError(error: unknown): boolean {
  return error instanceof Error && error.message === "Unexpected end of form";
}

function mapMulterError(error: multer.MulterError): ApiError {
  switch (error.code) {
    case "LIMIT_FILE_SIZE":
      return new ApiError(413, "UPLOAD_TOO_LARGE", "Uploaded file is too large.");
    case "LIMIT_FILE_COUNT":
    case "LIMIT_UNEXPECTED_FILE":
      return new ApiError(400, "UPLOAD_UNEXPECTED_FILE", "Upload must include exactly one video file.");
    case "LIMIT_FIELD_COUNT":
    case "LIMIT_PART_COUNT":
    case "LIMIT_FIELD_KEY":
    case "LIMIT_FIELD_VALUE":
      return new ApiError(400, "UPLOAD_INVALID_MULTIPART", "Invalid multipart upload.");
    default:
      return new ApiError(400, "UPLOAD_INVALID_MULTIPART", "Invalid multipart upload.");
  }
}
