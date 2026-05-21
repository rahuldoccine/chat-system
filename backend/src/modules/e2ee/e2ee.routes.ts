import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import type { Logger } from "../../lib/logger.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";

import * as e2eeController from "./e2ee.controller.js";
import { createE2eeRecoveryHandlers } from "./recovery/e2ee-recovery.controller.js";

export function createE2eeRouter(config: AppConfig, logger: Logger): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  const recovery = createE2eeRecoveryHandlers(config, logger);

  router.put("/identity", requireAuth, asyncHandler(e2eeController.putIdentityKey));
  router.get("/identity/:userId", requireAuth, asyncHandler(e2eeController.getIdentityKey));

  router.put("/devices/:deviceId", requireAuth, asyncHandler(e2eeController.putDeviceKey));
  router.get("/devices/:userId", requireAuth, asyncHandler(e2eeController.listDevices));

  router.post("/prekeys/:deviceId", requireAuth, asyncHandler(e2eeController.postPreKeys));
  router.get("/prekeys/:userId/:deviceId", requireAuth, asyncHandler(e2eeController.getPreKeyBundle));

  router.put("/backup", requireAuth, asyncHandler(recovery.putBackup));
  router.post("/recovery/challenge/email", requireAuth, asyncHandler(recovery.postEmailChallenge));
  router.post("/recovery/verify/email", requireAuth, asyncHandler(recovery.postEmailVerify));
  router.get("/backup", requireAuth, asyncHandler(recovery.getBackup));

  return router;
}

