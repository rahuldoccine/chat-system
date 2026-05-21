import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";

import * as friendsController from "./friends.controller.js";

export function createFriendsRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  router.use(requireAuth);

  router.get("/", asyncHandler(friendsController.listFriends));
  router.delete("/requests/:friendId", asyncHandler(friendsController.cancelFriendRequest));

  router.post("/request", asyncHandler(friendsController.requestFriend));
  router.post("/accept", asyncHandler(friendsController.acceptFriend));
  router.post("/reject", asyncHandler(friendsController.rejectFriend));
  router.delete("/:userId", asyncHandler(friendsController.removeFriend));

  return router;
}
