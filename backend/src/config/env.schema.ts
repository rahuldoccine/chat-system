import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default("0.0.0.0"),
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(16).optional(),
    JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
    JWT_EXPIRES_IN: z.string().default("1h"),
    REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().positive().default(30),
    PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    FRONTEND_URL: z.string().url().default("http://localhost:5173"),
    REFRESH_COOKIE_NAME: z.string().min(1).default("refresh_token"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().email().optional(),
    CORS_ORIGIN: z
      .string()
      .optional()
      .transform((s) => {
        const raw = (s ?? "http://localhost:5173")
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean);
        return raw.length > 0 ? raw : ["http://localhost:5173"];
      }),
    UPLOAD_DIR: z.string().default("./uploads"),
    MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    AUTH_LOGIN_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    AUTH_LOGIN_MAX: z.coerce.number().int().positive().default(20),
    AUTH_FORGOT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    AUTH_FORGOT_MAX: z.coerce.number().int().positive().default(5),
    AUTH_REFRESH_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    AUTH_REFRESH_MAX: z.coerce.number().int().positive().default(60),
    /** Set to "false" to hide Swagger UI. When unset, Swagger is on in development only. */
    ENABLE_SWAGGER: z.string().optional(),
    /** When set, Socket.IO uses `@socket.io/redis-adapter` for multi-node fan-out. */
    REDIS_URL: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url().optional(),
    ),
    /** Firebase project id for FCM (optional; push disabled if unset). */
    FCM_PROJECT_ID: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(1).optional(),
    ),
    /** Path to Firebase service account JSON file (optional). */
    FCM_SERVICE_ACCOUNT_PATH: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(1).optional(),
    ),
    /** Web Push VAPID public key (URL-safe base64). Optional; enables web push delivery. */
    VAPID_PUBLIC_KEY: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(1).optional(),
    ),
    /** Web Push VAPID private key (URL-safe base64). */
    VAPID_PRIVATE_KEY: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(1).optional(),
    ),
    /** Contact for Web Push (e.g. mailto:support@example.com). */
    VAPID_SUBJECT: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(1).optional(),
    ),
    /**
     * Receipts scanned per DB query when flushing offline delivery backlog on reconnect.
     * Lower values reduce query load; higher values reduce roundtrips.
     */
    CHAT_RECONNECT_DELIVERY_PAGE_SIZE: z.coerce.number().int().min(100).max(5000).default(1000),
    /**
     * Max synchronous reconnect flush time (ms) before yielding and continuing async.
     */
    CHAT_RECONNECT_DELIVERY_SYNC_BUDGET_MS: z.coerce.number().int().min(50).max(5000).default(250),
    /**
     * Safety cap for async reconnect flush loops spawned after initial connect pass.
     */
    CHAT_RECONNECT_DELIVERY_MAX_ASYNC_PASSES: z.coerce.number().int().min(1).max(200).default(20),
    /** Server-side Open Graph link previews on send (non-E2EE). Set "false" to disable. */
    LINK_PREVIEW_ENABLED: z
      .string()
      .optional()
      .transform((s) => s !== "false" && s !== "0"),
  });

export type EnvSchemaIn = z.infer<typeof envSchema>;

export type EnvSchema = EnvSchemaIn & {
  jwtAccessSecret: string;
};

/** Legacy env key; read from process.env instead of the parsed schema object. */
function readLegacyJwtSecretFromEnv(raw: NodeJS.ProcessEnv): string | undefined {
  const v = raw.JWT_SECRET;
  if (typeof v !== "string" || v.length < 16) return undefined;
  return v;
}

export function parseEnv(raw: NodeJS.ProcessEnv): EnvSchema {
  const legacyJwt = readLegacyJwtSecretFromEnv(raw);
  const parsed = envSchema
    .superRefine((val, ctx) => {
      if (!val.JWT_ACCESS_SECRET && !legacyJwt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Set JWT_ACCESS_SECRET or JWT_SECRET (min 16 characters)",
          path: ["JWT_ACCESS_SECRET"],
        });
      }
      if (val.SMTP_HOST && !val.SMTP_FROM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SMTP_FROM is required when SMTP_HOST is set",
          path: ["SMTP_FROM"],
        });
      }
    })
    .safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment: ${JSON.stringify(msg)}`);
  }
  const data = parsed.data;
  const jwtAccessSecret = data.JWT_ACCESS_SECRET ?? legacyJwt;
  if (!jwtAccessSecret) {
    throw new Error("Invalid environment: JWT_ACCESS_SECRET or JWT_SECRET is required");
  }
  return { ...data, jwtAccessSecret };
}
