import type { ErrorRequestHandler, Request } from "express";
import multer from "multer";

import { AppError } from "../errors/index.js";
import { isBenignNotFoundProbe } from "../lib/http-log.js";
import type { Logger } from "../lib/logger.js";

export function errorHandler(logger: Logger, isProd: boolean): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const requestId = req.requestId;

    if (err instanceof multer.MulterError) {
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
      return;
    }

    if (err instanceof AppError) {
      if (err.httpStatus >= 500) {
        logger.error({ err, requestId }, err.message);
      } else {
        const reqTyped = req as Request;
        const quiet404 =
          err.httpStatus === 404 &&
          err.code === "NOT_FOUND" &&
          isBenignNotFoundProbe(reqTyped);
        if (quiet404) {
          logger.debug({ err: { code: err.code, message: err.message }, requestId }, "not found");
        } else {
          logger.warn({ err: { code: err.code, message: err.message }, requestId });
        }
      }
      res.status(err.httpStatus).json({
        code: err.code,
        message: err.message,
        requestId,
        ...(err.details !== undefined ? { details: err.details } : {}),
      });
      return;
    }

    logger.error({ err, requestId }, "Unhandled error");

    const message = isProd ? "Internal server error" : (err as Error).message;
    res.status(500).json({
      code: "INTERNAL_ERROR",
      message,
      requestId,
      ...(!isProd && err instanceof Error && err.stack ? { stack: err.stack } : {}),
    });
  };
}
