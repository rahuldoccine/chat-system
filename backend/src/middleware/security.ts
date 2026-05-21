import compression from "compression";
import cors from "cors";
import type { Express } from "express";
import helmet from "helmet";

import type { AppConfig } from "../config/index.js";

export function applySecurityMiddleware(app: Express, config: AppConfig): void {
  if (config.isProd) {
    app.set("trust proxy", 1);
  }

  app.use(
    config.swaggerEnabled
      ? helmet({
          contentSecurityPolicy: {
            directives: {
              ...helmet.contentSecurityPolicy.getDefaultDirectives(),
              "script-src": ["'self'", "'unsafe-inline'"],
              "style-src": ["'self'", "'unsafe-inline'", "https:"],
              "img-src": ["'self'", "data:", "https:", "blob:"],
              "font-src": ["'self'", "https:", "data:"],
            },
          },
        })
      : helmet({
          crossOriginResourcePolicy: { policy: "cross-origin" },
        }),
  );
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    }),
  );
  app.use(compression());
}
