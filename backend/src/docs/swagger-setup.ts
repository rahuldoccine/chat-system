import type { Express } from "express";
import swaggerUi from "swagger-ui-express";

import type { AppConfig } from "../config/index.js";

import { buildOpenApiDocument } from "./openapi.js";

export function setupSwaggerUi(app: Express, config: AppConfig): void {
  const spec = buildOpenApiDocument(config);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "Mernchat API docs" }));
}
