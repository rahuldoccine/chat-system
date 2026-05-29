import "dotenv/config";

import path from "node:path";

import { parseEnv, type EnvSchema } from "./env.schema.js";

export type AppConfig = {
  nodeEnv: EnvSchema["NODE_ENV"];
  port: number;
  host: string;
  databaseUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtExpiresIn: string;
  refreshTokenExpiresDays: number;
  passwordResetTokenTtlMinutes: number;
  bcryptRounds: number;
  frontendUrl: string;
  refreshCookieName: string;
  smtp: {
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
    from?: string;
  };
  corsOrigins: string[];
  uploadDir: string;
  maxUploadBytes: number;
  logLevel: EnvSchema["LOG_LEVEL"];
  isDev: boolean;
  isProd: boolean;
  authLoginWindowMs: number;
  authLoginMax: number;
  authForgotWindowMs: number;
  authForgotMax: number;
  authRefreshWindowMs: number;
  authRefreshMax: number;
  /** Swagger UI at /api/docs and OpenAPI JSON at /api/v1/openapi.json */
  swaggerEnabled: boolean;
  /** Optional Redis for Socket.IO adapter (cluster). */
  redisUrl?: string;
  /** Optional FCM / Firebase push. */
  fcmProjectId?: string;
  fcmServiceAccountPath?: string;
  /** Optional Web Push (VAPID). */
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
  /** Receipt rows scanned per reconnect flush query. */
  chatReconnectDeliveryPageSize: number;
  /** Synchronous reconnect flush budget in milliseconds. */
  chatReconnectDeliverySyncBudgetMs: number;
  /** Max async reconnect flush passes after connect. */
  chatReconnectDeliveryMaxAsyncPasses: number;
  linkPreviewEnabled: boolean;
};

let cached: AppConfig | null = null;

function cleanEnvString(value?: string): string | undefined {
  if (value == null || value === "") return undefined;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function resolveUploadDir(relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) {
    return relativeOrAbsolute;
  }
  return path.resolve(process.cwd(), relativeOrAbsolute);
}

export function loadConfig(overrides?: Partial<NodeJS.ProcessEnv>): AppConfig {
  if (cached && !overrides) {
    return cached;
  }
  const env = parseEnv({ ...process.env, ...overrides });
  const swaggerFlag = env.ENABLE_SWAGGER?.toLowerCase();
  const swaggerEnabled =
    swaggerFlag === "false" || swaggerFlag === "0"
      ? false
      : swaggerFlag === "true" || swaggerFlag === "1"
        ? true
        : env.NODE_ENV === "development";

  const cfg: AppConfig = {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    databaseUrl: env.DATABASE_URL,
    jwtAccessSecret: env.jwtAccessSecret,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    refreshTokenExpiresDays: env.REFRESH_TOKEN_EXPIRES_DAYS,
    passwordResetTokenTtlMinutes: env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
    bcryptRounds: env.BCRYPT_ROUNDS,
    frontendUrl: env.FRONTEND_URL,
    refreshCookieName: env.REFRESH_COOKIE_NAME,
    smtp: {
      host: cleanEnvString(env.SMTP_HOST),
      port: env.SMTP_PORT,
      user: cleanEnvString(env.SMTP_USER),
      pass: cleanEnvString(env.SMTP_PASS),
      from: cleanEnvString(env.SMTP_FROM),
    },
    corsOrigins: env.CORS_ORIGIN,
    uploadDir: resolveUploadDir(env.UPLOAD_DIR),
    maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
    logLevel: env.LOG_LEVEL,
    isDev: env.NODE_ENV === "development",
    isProd: env.NODE_ENV === "production",
    authLoginWindowMs: env.AUTH_LOGIN_WINDOW_MS,
    authLoginMax: env.AUTH_LOGIN_MAX,
    authForgotWindowMs: env.AUTH_FORGOT_WINDOW_MS,
    authForgotMax: env.AUTH_FORGOT_MAX,
    authRefreshWindowMs: env.AUTH_REFRESH_WINDOW_MS,
    authRefreshMax: env.AUTH_REFRESH_MAX,
    swaggerEnabled,
    redisUrl: env.REDIS_URL,
    fcmProjectId: env.FCM_PROJECT_ID,
    fcmServiceAccountPath: env.FCM_SERVICE_ACCOUNT_PATH,
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
    vapidPrivateKey: env.VAPID_PRIVATE_KEY,
    vapidSubject: env.VAPID_SUBJECT,
    chatReconnectDeliveryPageSize: env.CHAT_RECONNECT_DELIVERY_PAGE_SIZE,
    chatReconnectDeliverySyncBudgetMs: env.CHAT_RECONNECT_DELIVERY_SYNC_BUDGET_MS,
    chatReconnectDeliveryMaxAsyncPasses: env.CHAT_RECONNECT_DELIVERY_MAX_ASYNC_PASSES,
    linkPreviewEnabled: env.LINK_PREVIEW_ENABLED,
  };
  if (!overrides) {
    cached = cfg;
  }
  return cfg;
}

export function resetConfigCache(): void {
  cached = null;
}
