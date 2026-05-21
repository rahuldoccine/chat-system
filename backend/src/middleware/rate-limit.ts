import rateLimit from "express-rate-limit";

import type { AppConfig } from "../config/index.js";

export function createLoginRateLimiter(config: AppConfig) {
  return rateLimit({
    windowMs: config.authLoginWindowMs,
    max: config.authLoginMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "RATE_LIMIT", message: "Too many login attempts" },
  });
}

export function createForgotPasswordRateLimiter(config: AppConfig) {
  return rateLimit({
    windowMs: config.authForgotWindowMs,
    max: config.authForgotMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "RATE_LIMIT", message: "Too many password reset requests" },
  });
}

export function createRefreshRateLimiter(config: AppConfig) {
  return rateLimit({
    windowMs: config.authRefreshWindowMs,
    max: config.authRefreshMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "RATE_LIMIT", message: "Too many refresh attempts" },
  });
}

export function createModerationRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "RATE_LIMIT", message: "Too many moderation actions" },
  });
}

export function createReportsRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "RATE_LIMIT", message: "Too many reports" },
  });
}

export function createAdminModerationRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "RATE_LIMIT", message: "Too many admin moderation requests" },
  });
}

export function createLinkPreviewRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "RATE_LIMIT", message: "Too many link preview requests" },
  });
}
