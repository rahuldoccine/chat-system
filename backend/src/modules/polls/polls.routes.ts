import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";

import * as pollsController from "./polls.controller.js";

export function createPollsRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  router.use(requireAuth);

  router.get("/:pollId", asyncHandler(pollsController.getPoll));
  router.post("/:pollId/vote", asyncHandler(pollsController.votePoll));

  return router;
}
