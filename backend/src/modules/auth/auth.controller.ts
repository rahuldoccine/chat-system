import type { Request, Response } from "express";

import type { AppConfig } from "../../config/index.js";
import type { Logger } from "../../lib/logger.js";
import { parseBody } from "../../validation/validate.js";

import { getSocketIo } from "../../sockets/socket-holder.js";
import { roomUser } from "../../sockets/rooms.js";
import { clearRefreshCookie, setRefreshCookie } from "./auth.cookies.js";
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  refreshBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
} from "./auth.schemas.js";
import * as authService from "./auth.service.js";

function sessionMeta(req: Request): authService.SessionMeta {
  const ua = req.headers["user-agent"];
  return {
    userAgent: typeof ua === "string" ? ua : undefined,
    ip: req.ip || undefined,
  };
}

function readRefreshToken(req: Request, config: AppConfig): string | undefined {
  const parsed = refreshBodySchema.safeParse(req.body ?? {});
  const fromBody = parsed.success ? parsed.data.refreshToken : undefined;
  const c = req.cookies as Record<string, string | undefined> | undefined;
  const fromCookie = c?.[config.refreshCookieName];
  return (typeof fromBody === "string" && fromBody.trim() ? fromBody : fromCookie)?.trim();
}

export function createAuthHandlers(config: AppConfig, logger: Logger) {
  return {
    register: async (req: Request, res: Response): Promise<void> => {
      const body = parseBody(registerBodySchema, req.body);
      const result = await authService.registerUser(config, body, sessionMeta(req));
      setRefreshCookie(res, config, result.refreshToken);
      res.status(201).json({
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
    },

    login: async (req: Request, res: Response): Promise<void> => {
      const body = parseBody(loginBodySchema, req.body);
      const result = await authService.loginUser(config, body, sessionMeta(req));
      setRefreshCookie(res, config, result.refreshToken);
      res.status(200).json({
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
    },

    refresh: async (req: Request, res: Response): Promise<void> => {
      const raw = readRefreshToken(req, config);
      const result = await authService.refreshTokens(config, raw, sessionMeta(req));
      setRefreshCookie(res, config, result.refreshToken);
      res.status(200).json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
    },

    logout: async (req: Request, res: Response): Promise<void> => {
      const raw = readRefreshToken(req, config);
      await authService.logoutSession(config, raw);
      clearRefreshCookie(res, config);
      res.status(204).send();
    },

    logoutAll: async (req: Request, res: Response): Promise<void> => {
      const userId = req.user!.sub;
      await authService.logoutAllSessions(userId);
      clearRefreshCookie(res, config);
      const io = getSocketIo();
      io?.to(roomUser(userId)).emit("session:revoked", { reason: "logout_all" });
      res.status(204).send();
    },

    forgotPassword: async (req: Request, res: Response): Promise<void> => {
      const body = parseBody(forgotPasswordBodySchema, req.body);
      await authService.forgotPassword(config, logger, body.email);
      res.status(200).json({
        ok: true,
        message: "If an account exists for that email, password reset instructions were sent.",
      });
    },

    resetPassword: async (req: Request, res: Response): Promise<void> => {
      const body = parseBody(resetPasswordBodySchema, req.body);
      await authService.resetPasswordWithToken(config, body);
      res.status(204).send();
    },
  };
}
