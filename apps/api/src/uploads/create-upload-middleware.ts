import multer from "multer";
import { rm } from "node:fs/promises";
import { nanoid } from "nanoid";
import type { Request, RequestHandler } from "express";
import type { ApiConfig } from "../config.js";
import { insufficientStorageForOperation } from "../storage/storage-capacity.js";
import type { StoragePolicyService } from "../storage/storage-policy-service.js";
import type { StorageReservation } from "../storage/storage-reservations.js";

const removeOptions = { force: true, maxRetries: 5, retryDelay: 150 };

type UploadRequest = Request & {
  storageReservation?: StorageReservation;
};

export function createUploadMiddleware(config: ApiConfig, storagePolicy?: StoragePolicyService): RequestHandler {
  return async (req, res, next) => {
    let safeLimit = config.uploadFileSizeLimitBytes;
    try {
      if (storagePolicy) {
        safeLimit = await storagePolicy.getSafeUploadLimit(config.uploadFileSizeLimitBytes);
        if (safeLimit <= 0) throw insufficientStorageForOperation("upload");
        const contentLength = Number(req.headers["content-length"]);
        if (Number.isFinite(contentLength) && safeLimit < config.uploadFileSizeLimitBytes && contentLength > safeLimit)
          throw insufficientStorageForOperation("upload");
        const reservation = await storagePolicy.reserve({ operation: "upload", requiredBytes: safeLimit });
        (req as UploadRequest).storageReservation = reservation;
        res.once("finish", () => reservation.release());
        res.once("close", () => reservation.release());
      }
    } catch (error) {
      next(error);
      return;
    }

    const singleVideo = createSingleVideoMiddleware(config, safeLimit);
    singleVideo(req, res, (error) => {
      if (!error) {
        if (!storagePolicy || !req.file) {
          next();
          return;
        }
        storagePolicy
          .assertCanAllocate({ operation: "upload", requiredBytes: 0 })
          .then(() => next())
          .catch((capacityError) => {
            cleanupStaged(req)
              .then(() => next(capacityError))
              .catch((cleanupError) => next(cleanupError));
          });
        return;
      }

      if (
        storagePolicy &&
        error instanceof multer.MulterError &&
        error.code === "LIMIT_FILE_SIZE" &&
        safeLimit < config.uploadFileSizeLimitBytes
      ) {
        cleanupStaged(req)
          .then(() => next(insufficientStorageForOperation("upload")))
          .catch((cleanupError) => next(cleanupError));
        return;
      }

      cleanupStaged(req)
        .then(() => next(error))
        .catch((cleanupError) => next(cleanupError));
    });
  };
}

function createSingleVideoMiddleware(config: ApiConfig, fileSize: number): RequestHandler {
  const upload = multer({
    storage: multer.diskStorage({
      destination: config.uploadStagingDir,
      filename: (_req, _file, callback) => callback(null, nanoid())
    }),
    limits: {
      fileSize,
      files: 1,
      fields: 0,
      parts: 2,
      fieldNameSize: 100,
      fieldSize: 1024,
      headerPairs: 100,
      fieldNestingDepth: 0
    }
  });
  return upload.single("video");
}

async function cleanupStaged(req: Express.Request): Promise<void> {
  const stagedFiles = stagedFilePaths(req);
  await Promise.all(stagedFiles.map((filePath) => rm(filePath, removeOptions)));
}

function stagedFilePaths(req: Express.Request): string[] {
  const paths: string[] = [];
  if (req.file?.path) paths.push(req.file.path);
  const files = req.files;
  if (Array.isArray(files)) {
    for (const file of files) if (file.path) paths.push(file.path);
  } else if (files) {
    for (const list of Object.values(files)) {
      for (const file of list) if (file.path) paths.push(file.path);
    }
  }
  return paths;
}
