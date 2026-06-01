import jwt from "jsonwebtoken";
import type { Server as HttpServer } from "node:http";

import { Server } from "socket.io";

import type { AppConfig } from "../config/index.js";
import { verifyAccessTokenActive } from "../lib/validate-access-token.js";
import type { Logger } from "../lib/logger.js";

import { registerSocketHandlers } from "./handlers.js";

export async function initSocket(
  httpServer: HttpServer,
  config: AppConfig,
  logger: Logger,
): Promise<Server> {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigins,
      credentials: true,
    },
  });

  if (config.redisUrl) {
    try {
      const { createClient } = await import("redis");
      const { createAdapter } = await import("@socket.io/redis-adapter");
      const pubClient = createClient({ url: config.redisUrl });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      logger.info(
        config.isDev ? "Redis adapter connected (Socket.IO)" : "socket.io Redis adapter enabled",
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error(
        config.isDev
          ? `Redis adapter failed (${detail}) - Socket.IO without Redis`
          : "socket.io Redis adapter failed; continuing without Redis",
      );
      if (!config.isDev) logger.error({ err });
    }
  }

  io.use((socket, next) => {
    void (async () => {
      try {
        const authToken = socket.handshake.auth?.token;
        const headerAuth = socket.handshake.headers.authorization;
        const token =
          (typeof authToken === "string" ? authToken : undefined) ??
          (typeof headerAuth === "string" ? headerAuth.replaceAll(/^Bearer\s+/gi, "").trim() : "");

        if (!token) {
          next(new Error("Unauthorized"));
          return;
        }

        const user = await verifyAccessTokenActive(token, config);
        socket.data.user = user;

        const decoded = jwt.decode(token) as { exp?: number } | null;
        const exp = decoded?.exp;
        if (exp) {
          const msLeft = exp * 1000 - Date.now();
          if (msLeft > 0) {
            const timer = setTimeout(() => {
              logger.info(
                { userId: user.sub, socketId: socket.id },
                "Disconnecting socket automatically due to JWT token expiration",
              );
              socket.disconnect(true);
            }, msLeft);

            socket.on("disconnect", () => {
              clearTimeout(timer);
            });
          } else {
            next(new Error("Unauthorized"));
            return;
          }
        }

        next();
      } catch {
        next(new Error("Unauthorized"));
      }
    })();
  });

  registerSocketHandlers(io, config, logger);

  return io;
}
