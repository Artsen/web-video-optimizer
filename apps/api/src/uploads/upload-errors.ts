import { ApiError } from "../errors/api-error.js";
import type { ApiErrorCode } from "../errors/api-error.js";

export class UploadAdmissionError extends ApiError {
  constructor(status: number, code: ApiErrorCode, message: string) {
    super(status, code, message);
  }
}

export const uploadErrors = {
  tooLarge: () => new UploadAdmissionError(413, "UPLOAD_TOO_LARGE", "Uploaded file is too large."),
  unexpectedFile: () =>
    new UploadAdmissionError(400, "UPLOAD_UNEXPECTED_FILE", "Upload must include exactly one video file."),
  invalidMultipart: () => new UploadAdmissionError(400, "UPLOAD_INVALID_MULTIPART", "Invalid multipart upload."),
  emptyFile: () => new UploadAdmissionError(400, "UPLOAD_EMPTY_FILE", "Uploaded file is empty."),
  invalidFilename: () => new UploadAdmissionError(400, "UPLOAD_INVALID_FILENAME", "Uploaded filename is not allowed."),
  unsupportedMedia: () =>
    new UploadAdmissionError(415, "UNSUPPORTED_MEDIA_TYPE", "Uploaded file type is not supported."),
  invalidMedia: () => new UploadAdmissionError(422, "INVALID_MEDIA", "Uploaded file is not a valid video.")
};
