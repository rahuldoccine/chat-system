import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";

import * as devicesController from "./devices.controller.js";

export function createDevicesRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  router.use(requireAuth);

  router.post("/web", asyncHandler(devicesController.postWebPush));
  router.post("/tokens", asyncHandler(devicesController.postToken));
  router.post("/tokens/revoke", asyncHandler(devicesController.postRevoke));
  router.get("/tokens", asyncHandler(devicesController.listTokens));

  return router;
}
