import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  void next;
  const message = error instanceof Error ? error.message : "Unexpected server error";
  res.status(500).json({ error: message });
};
