import type { ZodError, ZodIssue } from "zod";
import { ApiError, type ApiErrorDetail } from "../errors/api-error.js";

const maxIssues = 8;

function formatPath(path: ZodIssue["path"]): string {
  return path.length ? path.map(String).join(".") : "";
}

export function formatValidationIssues(error: ZodError): ApiErrorDetail[] {
  return error.issues.slice(0, maxIssues).map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message
  }));
}

export function validationError(error: ZodError): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", formatValidationIssues(error));
}
