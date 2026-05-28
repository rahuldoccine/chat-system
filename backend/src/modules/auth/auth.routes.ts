import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  createForgotPasswordRateLimiter,
  createLoginRateLimiter,
  createRefreshRateLimiter,
} from "../../middleware/rate-limit.js";
import type { Logger } from "../../lib/logger.js";

import { createAuthHandlers } from "./auth.controller.js";

import * as usersService from "../users/users.service.js";

export function createAuthRouter(config: AppConfig, logger: Logger): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  const handlers = createAuthHandlers(config, logger);

  const loginLimiter = createLoginRateLimiter(config);
  const forgotLimiter = createForgotPasswordRateLimiter(config);
  const refreshLimiter = createRefreshRateLimiter(config);

  router.post(
    "/register",
    loginLimiter,
    asyncHandler(async (req, res) => {
      await handlers.register(req, res);
    }),
  );

  router.post(
    "/login",
    loginLimiter,
    asyncHandler(async (req, res) => {
      await handlers.login(req, res);
    }),
  );

  router.post(
    "/refresh",
    refreshLimiter,
    asyncHandler(async (req, res) => {
      await handlers.refresh(req, res);
    }),
  );

  router.post(
    "/logout",
    asyncHandler(async (req, res) => {
      await handlers.logout(req, res);
    }),
  );

  router.post(
    "/logout-all",
    requireAuth,
    asyncHandler(async (req, res) => {
      await handlers.logoutAll(req, res);
    }),
  );

  router.post(
    "/change-password",
    requireAuth,
    loginLimiter,
    asyncHandler(async (req, res) => {
      await handlers.changePassword(req, res);
    }),
  );

  router.get(
    "/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = await usersService.getMe(req.user!.sub);
      res.json({ user });
    }),
  );

  router.post(
    "/forgot-password",
    forgotLimiter,
    asyncHandler(async (req, res) => {
      await handlers.forgotPassword(req, res);
    }),
  );

  router.post(
    "/reset-password",
    forgotLimiter,
    asyncHandler(async (req, res) => {
      await handlers.resetPassword(req, res);
    }),
  );

  return router;
}
