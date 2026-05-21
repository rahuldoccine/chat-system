import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";

import * as messagesController from "./messages.controller.js";

export function createMessagesRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  router.use(requireAuth);

  router.post("/:messageId/pin", asyncHandler(messagesController.pinMessage));
  router.delete("/:messageId/pin", asyncHandler(messagesController.unpinMessage));
  router.post("/:messageId/reactions", asyncHandler(messagesController.postReaction));
  router.delete("/:messageId/reactions/:emoji", asyncHandler(messagesController.deleteReaction));
  router.patch("/:messageId", asyncHandler(messagesController.patchMessage));
  router.delete("/:messageId", asyncHandler(messagesController.deleteMessage));

  return router;
}
