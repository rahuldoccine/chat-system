import cookieParser from "cookie-parser";
import express, { type Request, type Response } from "express";
import { pinoHttp } from "pino-http";

import type { AppConfig } from "./config/index.js";
import { setupSwaggerUi } from "./docs/swagger-setup.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { applySecurityMiddleware } from "./middleware/security.js";
import { serializeReqForLog, shouldSkipHttpAccessLog } from "./lib/http-log.js";
import type { Logger } from "./lib/logger.js";
import { createApiRouter } from "./routes/index.js";

export function createApp(deps: { config: AppConfig; logger: Logger }): express.Express {
  const { config, logger } = deps;
  const app = express();

  applySecurityMiddleware(app, config);
  app.use(requestIdMiddleware);
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    pinoHttp<Request, Response>({
      logger,
      quietReqLogger: true,
      customProps: (req) => (config.isDev ? {} : { requestId: req.requestId }),
      serializers: config.isDev
        ? { req: () => undefined, res: () => undefined }
        : { req: (req) => serializeReqForLog(req) },
      autoLogging: {
        ignore: (req) => shouldSkipHttpAccessLog(req),
      },
      customSuccessMessage: (req, res, responseTime) =>
        `${req.method} ${req.originalUrl ?? req.url} ${res.statusCode} ${responseTime}ms`,
      customErrorMessage: (req, res, err) =>
        `${req.method} ${req.originalUrl ?? req.url} ${res.statusCode} - ${err.message}`,
    }),
  );

  app.use("/api/v1", createApiRouter(config, logger));

  if (config.swaggerEnabled) {
    setupSwaggerUi(app, config);
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger, config.isProd));

  return app;
}
