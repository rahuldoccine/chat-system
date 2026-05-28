import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";

import * as groupsController from "./groups.controller.js";

export function createGroupsRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  router.use(requireAuth);

  router.get("/:groupId", asyncHandler(groupsController.getGroup));
  router.post("/:groupId/join", asyncHandler(groupsController.joinGroup));
  router.post("/", asyncHandler(groupsController.createGroup));
  router.patch("/:groupId", asyncHandler(groupsController.patchGroup));
  router.post("/:groupId/members", asyncHandler(groupsController.addMember));
  router.delete("/:groupId/members/:userId", asyncHandler(groupsController.removeMember));
  router.patch("/:groupId/members/:userId/role", asyncHandler(groupsController.patchMemberRole));

  return router;
}
