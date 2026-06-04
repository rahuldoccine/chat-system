import type { Express } from "express";
import swaggerUi from "swagger-ui-express";

import type { AppConfig } from "../config/index.js";

const swaggerUiOptions = {
  customSiteTitle: "Chat System API",
  swaggerOptions: {
    url: "/api/v1/openapi.json",
    persistAuthorization: true,
    displayRequestDuration: true,
    tryItOutEnabled: true,
  },
};

export function setupSwaggerUi(app: Express, _config: AppConfig): void {
  const serve = swaggerUi.serveWithOptions({ redirect: false });
  const setup = swaggerUi.setup(undefined, swaggerUiOptions);

  app.use("/api/docs", serve, setup);
  app.use("/api/docs/", serve, setup);
}
