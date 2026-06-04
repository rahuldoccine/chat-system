import { createRequire } from "node:module";

import type { Express, RequestHandler } from "express";
import express from "express";
import swaggerUi from "swagger-ui-express";

import type { AppConfig } from "../config/index.js";

const require = createRequire(import.meta.url);
const swaggerUiDistPath = require("swagger-ui-dist/absolute-path")() as string;

const swaggerUiOptions = {
  customSiteTitle: "Chat System API",
  swaggerOptions: {
    url: "/api/v1/openapi.json",
    persistAuthorization: true,
    displayRequestDuration: true,
    tryItOutEnabled: true,
  },
};

/** Serve Swagger UI static assets from the installed swagger-ui-dist package. */
function swaggerStaticMiddleware(): RequestHandler {
  return express.static(swaggerUiDistPath, {
    index: false,
    maxAge: "1h",
    setHeaders(res, filePath) {
      if (filePath.endsWith(".js") || filePath.endsWith(".css")) {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
    },
  });
}

export function setupSwaggerUi(app: Express, _config: AppConfig): void {
  app.get("/api/docs", (_req, res) => {
    res.redirect(301, "/api/docs/");
  });

  app.use(
    "/api/docs",
    swaggerStaticMiddleware(),
    ...swaggerUi.serveFiles(undefined, { swaggerUrl: "/api/v1/openapi.json" }),
    swaggerUi.setup(undefined, swaggerUiOptions),
  );
}
