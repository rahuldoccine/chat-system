import type { CookieOptions, Response } from "express";

import type { AppConfig } from "../../config/index.js";

export function setRefreshCookie(res: Response, config: AppConfig, refreshToken: string): void {
  const maxAge = config.refreshTokenExpiresDays * 24 * 60 * 60 * 1000;
  const opts: CookieOptions = {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    maxAge,
    path: "/api/v1/auth",
  };
  res.cookie(config.refreshCookieName, refreshToken, opts);
}

export function clearRefreshCookie(res: Response, config: AppConfig): void {
  res.clearCookie(config.refreshCookieName, {
    path: "/api/v1/auth",
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
  });
}
