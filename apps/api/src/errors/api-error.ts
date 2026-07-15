export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_JSON"
  | "REQUEST_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "UPLOAD_TOO_LARGE"
  | "UPLOAD_UNEXPECTED_FILE"
  | "UPLOAD_INVALID_MULTIPART"
  | "UPLOAD_EMPTY_FILE"
  | "UPLOAD_INVALID_FILENAME"
  | "INVALID_MEDIA"
  | "INSUFFICIENT_STORAGE"
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
