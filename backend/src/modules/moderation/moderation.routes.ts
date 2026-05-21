import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { createRequirePlatformAdmin } from "../../middleware/require-platform-admin.js";
import {
  createAdminModerationRateLimiter,
  createModerationRateLimiter,
  createReportsRateLimiter,
} from "../../middleware/rate-limit.js";

import * as moderationController from "./moderation.controller.js";

export function createModerationRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  const modLimiter = createModerationRateLimiter();
  const reportLimiter = createReportsRateLimiter();
  const adminLimiter = createAdminModerationRateLimiter();
  const requirePlatformAdmin = createRequirePlatformAdmin();
  router.use(requireAuth);

  router.get(
    "/admin/reports",
    adminLimiter,
    requirePlatformAdmin,
    asyncHandler(moderationController.listAdminReports),
  );
  router.patch(
    "/admin/reports/:reportId",
    adminLimiter,
    requirePlatformAdmin,
    asyncHandler(moderationController.patchAdminReport),
  );

  router.get("/blocks/status/:userId", modLimiter, asyncHandler(moderationController.getBlockStatus));
  router.post("/blocks", modLimiter, asyncHandler(moderationController.postBlock));
  router.delete("/blocks/:blockedUserId", modLimiter, asyncHandler(moderationController.deleteBlock));
  router.post("/reports", reportLimiter, asyncHandler(moderationController.postReport));

  return router;
}

