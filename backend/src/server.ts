import fs from "node:fs";
import http from "node:http";

import { createApp } from "./app.js";
import { loadConfig } from "./config/index.js";
import { createLogger, logDevBanner } from "./lib/logger.js";
import { setPushWorkerLogger } from "./lib/push-queue.js";
import { initPrisma } from "./lib/prisma.js";
import { ensureCategoryDir, UPLOAD_CATEGORIES } from "./lib/upload-storage.js";
import { initSocket } from "./sockets/index.js";
import { setSocketIo } from "./sockets/socket-holder.js";

const config = loadConfig();
const logger = createLogger(config);
setPushWorkerLogger(logger);
const prisma = initPrisma(config);

fs.mkdirSync(config.uploadDir, { recursive: true });
for (const category of UPLOAD_CATEGORIES) {
  await ensureCategoryDir(config.uploadDir, category);
}

const app = createApp({ config, logger });
const httpServer = http.createServer(app);
const io = await initSocket(httpServer, config, logger);
setSocketIo(io);

httpServer.listen(config.port, config.host, () => {
  const baseUrl = `http://localhost:${config.port}`;
  if (config.isDev) {
    logDevBanner(logger, [
      "",
      "  Chat System API",
      `  → ${baseUrl}`,
      `  → API ${baseUrl}/api/v1`,
      config.swaggerEnabled ? `  → Docs ${baseUrl}/api/docs` : "",
      `  → Uploads ${config.uploadDir}`,
      "  Ready. Waiting for requests…",
      "",
    ].filter(Boolean));
  } else {
    logger.info({ port: config.port, host: config.host }, "HTTP and Socket.IO server listening");
  }
});

function shutdown(signal: string): void {
  logger.info({ signal }, "graceful shutdown started");
  httpServer.close((closeErr) => {
    if (closeErr) {
      logger.error({ err: closeErr }, "error closing HTTP server");
    }
    setSocketIo(null);
    io.close(() => {
      void prisma
        .$disconnect()
        .then(() => {
          logger.info("prisma disconnected");
          process.exit(0);
        })
        .catch((err: unknown) => {
          logger.error({ err }, "prisma disconnect failed");
          process.exit(1);
        });
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
