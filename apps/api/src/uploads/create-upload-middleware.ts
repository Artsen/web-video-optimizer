import multer from "multer";
import { rm } from "node:fs/promises";
import { nanoid } from "nanoid";
import type { RequestHandler } from "express";
import type { ApiConfig } from "../config.js";

const removeOptions = { force: true, maxRetries: 5, retryDelay: 150 };

export function createUploadMiddleware(config: ApiConfig): RequestHandler {
  const upload = multer({
    storage: multer.diskStorage({
      destination: config.uploadStagingDir,
      filename: (_req, _file, callback) => callback(null, nanoid())
    }),
    limits: {
      fileSize: config.uploadFileSizeLimitBytes,
      files: 1,
      fields: 0,
      parts: 2,
      fieldNameSize: 100,
      fieldSize: 1024,
      headerPairs: 100,
      fieldNestingDepth: 0
    }
  });
  const singleVideo = upload.single("video");
  return (req, res, next) => {
    singleVideo(req, res, (error) => {
      if (!error) {
        next();
        return;
      }

      const stagedFiles = stagedFilePaths(req);
      Promise.all(stagedFiles.map((filePath) => rm(filePath, removeOptions)))
        .then(() => next(error))
        .catch((cleanupError) => next(cleanupError));
    });
  };
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
