import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { createLinkPreviewRateLimiter } from "../../middleware/rate-limit.js";

import * as chatsController from "./chats.controller.js";

export function createChatsRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  router.use(requireAuth);

  router.get("/", asyncHandler(chatsController.listChats));
  router.post("/", asyncHandler(chatsController.createChat));
  router.get(
    "/link-preview",
    createLinkPreviewRateLimiter(),
    asyncHandler(chatsController.getLinkPreview),
  );
  router.patch("/:chatId/mute", asyncHandler(chatsController.patchChatMute));
  router.patch("/:chatId/pin", asyncHandler(chatsController.patchChatPin));
  router.patch("/:chatId/favorite", asyncHandler(chatsController.patchChatFavorite));
  router.patch("/:chatId/close", asyncHandler(chatsController.patchChatClose));
  router.get("/:chatId", asyncHandler(chatsController.getChat));
  router.get("/:chatId/unread", asyncHandler(chatsController.getChatUnread));
  router.post("/:chatId/read", asyncHandler(chatsController.markChatRead));
  router.post("/:chatId/read/messages", asyncHandler(chatsController.markMessagesRead));
  router.post("/:chatId/delivered/messages", asyncHandler(chatsController.markMessagesDelivered));
  router.get("/:chatId/messages/search", asyncHandler(chatsController.searchMessages));
  router.get("/:chatId/messages", asyncHandler(chatsController.listMessages));
  router.get(
    "/:chatId/threads/:rootMessageId/messages",
    asyncHandler(chatsController.listThreadMessages),
  );
  router.post(
    "/:chatId/threads/:rootMessageId/read",
    asyncHandler(chatsController.markThreadRead),
  );
  router.post("/:chatId/messages", asyncHandler(chatsController.createMessage));
  router.get("/:chatId/pins", asyncHandler(chatsController.listPins));
  router.post("/:chatId/polls", asyncHandler(chatsController.createPoll));

  return router;
}
