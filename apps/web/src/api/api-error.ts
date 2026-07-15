export type ApiValidationDetail = {
  path?: string;
  message: string;
};

type ApiErrorPayload = {
  error?: unknown;
  code?: unknown;
  details?: unknown;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: ApiValidationDetail[];

  constructor(message: string, options: { status: number; code?: string; details?: ApiValidationDetail[] }) {
    super(message);
    this.name = "ApiClientError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

function isValidationDetails(value: unknown): value is ApiValidationDetail[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        "message" in item &&
        typeof item.message === "string" &&
        (!("path" in item) || typeof item.path === "string")
    )
  );
}

export async function parseApiError(response: Response): Promise<ApiClientError> {
  const contentType = response.headers.get("content-type") ?? "";
  const fallback = response.statusText || `Request failed with status ${response.status}`;

  if (!contentType.includes("application/json")) {
    const text = (await response.text()).trim();
    return new ApiClientError(text || fallback, { status: response.status });
  }

  let payload: ApiErrorPayload;
  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    return new ApiClientError(fallback, { status: response.status });
  }

  const message = typeof payload.error === "string" && payload.error.trim() ? payload.error : fallback;
  const code = typeof payload.code === "string" ? payload.code : undefined;
  const details = isValidationDetails(payload.details) ? payload.details : undefined;

  return new ApiClientError(message, { status: response.status, code, details });
}

export function getReadableApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}
