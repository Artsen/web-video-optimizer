export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_JSON"
  | "REQUEST_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "CORS_ORIGIN_DENIED"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export type ApiErrorDetail = {
  path: string;
  message: string;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: ApiErrorDetail[]
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
