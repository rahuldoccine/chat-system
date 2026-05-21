import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";

import * as callsController from "./calls.controller.js";

export function createCallsRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  router.use(requireAuth);

  router.get("/history", asyncHandler(callsController.listMyCalls));
  router.get("/:callId", asyncHandler(callsController.getCall));
  router.patch("/:callId/transcript", asyncHandler(callsController.updateCallTranscript));

  return router;
}

