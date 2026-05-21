import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";

import * as usersController from "./users.controller.js";

export function createUsersRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);

  router.use(requireAuth);

  router.get("/me", asyncHandler(usersController.getMe));
  router.patch("/me", asyncHandler(usersController.patchMe));
  router.get("/me/settings", asyncHandler(usersController.getSettings));
  router.patch("/me/settings", asyncHandler(usersController.patchSettings));

  router.get("/search", asyncHandler(usersController.searchUsers));
  router.get("/:id", asyncHandler(usersController.getUserById));

  return router;
}
