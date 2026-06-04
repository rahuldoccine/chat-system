import { Router } from "express";

import type { AppConfig } from "../config/index.js";
import { buildOpenApiDocument } from "../docs/openapi.js";
import type { Logger } from "../lib/logger.js";
import { createAuthRouter } from "../modules/auth/auth.routes.js";
import { createChatsRouter } from "../modules/chats/chats.routes.js";
import { createCallsRouter } from "../modules/calls/calls.routes.js";
import { createDevicesRouter } from "../modules/devices/devices.routes.js";
import { createE2eeRouter } from "../modules/e2ee/e2ee.routes.js";
import { createFilesRouter } from "../modules/files/files.routes.js";
import { createFriendsRouter } from "../modules/friends/friends.routes.js";
import { createGroupsRouter } from "../modules/groups/groups.routes.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { createMessagesRouter } from "../modules/messages/messages.routes.js";
import { createPollsRouter } from "../modules/polls/polls.routes.js";
import { createUploadsRouter } from "../modules/uploads/uploads.routes.js";
import { createUsersRouter } from "../modules/users/users.routes.js";
import { createModerationRouter } from "../modules/moderation/moderation.routes.js";

export function createApiRouter(config: AppConfig, logger: Logger): Router {
  const api = Router();

  api.get("/openapi.json", (req, res) => {
    const host = req.get("host");
    const requestOrigin = host ? `${req.protocol}://${host}` : undefined;
    res.json(buildOpenApiDocument(config, { requestOrigin }));
  });

  api.get("/config/public", (_req, res) => {
    res.json({
      vapidPublicKey: config.vapidPublicKey ?? null,
    });
  });

  api.use("/health", healthRouter);
  api.use("/auth", createAuthRouter(config, logger));
  api.use("/users", createUsersRouter(config));
  api.use("/chats", createChatsRouter(config));
  api.use("/friends", createFriendsRouter(config));
  api.use("/messages", createMessagesRouter(config));
  api.use("/groups", createGroupsRouter(config));
  api.use("/polls", createPollsRouter(config));
  api.use("/files", createFilesRouter(config));
  api.use("/uploads", createUploadsRouter(config, logger));
  api.use("/devices", createDevicesRouter(config));
  api.use("/e2ee", createE2eeRouter(config, logger));
  api.use("/calls", createCallsRouter(config));
  api.use("/moderation", createModerationRouter(config));
  return api;
}
