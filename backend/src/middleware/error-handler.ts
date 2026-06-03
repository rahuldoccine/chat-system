import type { ErrorRequestHandler, Request, Response } from "express";
import multer from "multer";

import { AppError } from "../errors/index.js";
import { isBenignNotFoundProbe } from "../lib/http-log.js";
import type { Logger } from "../lib/logger.js";

function sendMulterError(
  err: multer.MulterError,
  res: Response,
  logger: Logger,
  requestId: string | undefined,
): void {
  if (err.code === "LIMIT_FILE_SIZE") {
    logger.warn({ err: { code: err.code }, requestId }, "upload rejected: file too large");
    res.status(413).json({
      code: "FILE_TOO_LARGE",
      message: "File exceeds the maximum upload size",
      requestId,
    });
    return;
  }
  logger.warn({ err, requestId }, "upload rejected");
  res.status(400).json({
    code: "UPLOAD_ERROR",
    message: err.message,
    requestId,
  });
}

function logAppError(err: AppError, req: Request, logger: Logger, requestId: string | undefined): void {
  if (err.httpStatus >= 500) {
    logger.error({ err, requestId }, err.message);
    return;
  }
  const quiet404 =
    err.httpStatus === 404 && err.code === "NOT_FOUND" && isBenignNotFoundProbe(req);
  if (quiet404) {
    logger.debug({ err: { code: err.code, message: err.message }, requestId }, "not found");
    return;
  }
  logger.warn({ err: { code: err.code, message: err.message }, requestId });
}

function sendAppError(err: AppError, res: Response, requestId: string | undefined): void {
  res.status(err.httpStatus).json({
    code: err.code,
    message: err.message,
    requestId,
    ...(err.details === undefined ? {} : { details: err.details }),
  });
}

function sendUnknownError(
  err: unknown,
  res: Response,
  logger: Logger,
  requestId: string | undefined,
  isProd: boolean,
): void {
  logger.error({ err, requestId }, "Unhandled error");
  const message = isProd ? "Internal server error" : (err as Error).message;
  res.status(500).json({
    code: "INTERNAL_ERROR",
    message,
    requestId,
    ...(!isProd && err instanceof Error && err.stack ? { stack: err.stack } : {}),
  });
}

export function errorHandler(logger: Logger, isProd: boolean): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const requestId = req.requestId;

    if (err instanceof multer.MulterError) {
      sendMulterError(err, res, logger, requestId);
      return;
    }

    if (err instanceof AppError) {
      logAppError(err, req, logger, requestId);
      sendAppError(err, res, requestId);
      return;
    }

    sendUnknownError(err, res, logger, requestId, isProd);
  };
}
