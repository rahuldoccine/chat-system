import type { AppConfig } from "../config/index.js";
import {
  authTokensResponse,
  bearerAuthSecurity,
  bearerJsonResponses,
  chatIdPathParameter,
  createdOrExistingResponses,
  cursorListResponse,
  deviceTokenListJsonResponse,
  e2eeOp,
  emailPasswordRequestSchema,
  jsonRequestBody,
  refreshTokenOptionalBody,
  stringPathParameter,
  unauthorizedResponse,
  uuidPathParameter,
  withUnauthorized,
} from "./openapi.helpers.js";

function isLocalOrigin(origin: string): boolean {
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin.replace(/\/$/, ""));
}

function apiBaseFromOrigin(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
}

/** Swagger "Servers" list: live URL first; local only in development. */
export function resolveOpenApiServers(
  config: AppConfig,
  requestOrigin?: string,
): Array<{ url: string; description: string }> {
  const localServer = `http://127.0.0.1:${config.port}/api/v1`;
  const fromRequest =
    requestOrigin && !isLocalOrigin(requestOrigin)
      ? apiBaseFromOrigin(requestOrigin)
      : undefined;
  const liveServer = config.publicApiUrl ?? fromRequest;

  if (liveServer) {
    if (config.isDev) {
      return [
        { url: liveServer, description: "Live API" },
        { url: localServer, description: "Local" },
      ];
    }
    return [{ url: liveServer, description: "Live API" }];
  }
  return [{ url: localServer, description: "API" }];
}

/** OpenAPI 3.0 document for Swagger UI and `/api/v1/openapi.json`. */
export function buildOpenApiDocument(
  config: AppConfig,
  options?: { requestOrigin?: string },
): Record<string, unknown> {
  const servers = resolveOpenApiServers(config, options?.requestOrigin);
  const refreshCookie = config.refreshCookieName;

  return {
    openapi: "3.0.3",
    info: {
      title: "Chat System API",
      version: "0.1.0",
      description:
        "REST API for the chat backend. Access JWT: `Authorization: Bearer <token>`. Refresh: HttpOnly cookie `" +
        refreshCookie +
        "` on `/api/v1/auth` **or** JSON field `refreshToken` on refresh/logout.",
    },
    servers,
    tags: [
      { name: "Health", description: "Liveness and readiness" },
      { name: "Auth", description: "Registration, sessions, password reset" },
      { name: "Users", description: "Profile, search, settings" },
      { name: "Chats", description: "Inbox, DMs/groups, messages, pins, polls (create)" },
      { name: "Messages", description: "Edit/delete, reactions, pin by message id" },
      { name: "Friends", description: "Requests and friendships" },
      { name: "Groups", description: "Group admin facade over Chat type GROUP" },
      { name: "Polls", description: "Read poll and vote" },
      { name: "Files", description: "Authorized download by storage key" },
      { name: "Uploads", description: "Multipart uploads (authenticated)" },
      { name: "Devices", description: "FCM device token register and revoke (authenticated)" },
      { name: "E2EE", description: "E2EE key directory, prekeys, and recovery (ciphertext-only; backend never decrypts)" },
      { name: "Calls", description: "Call history and signaling metadata" },
      { name: "Moderation", description: "Blocks and reports" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Short-lived access JWT (`tokenUse: access`).",
        },
        refreshCookie: {
          type: "apiKey",
          in: "cookie",
          name: refreshCookie,
          description: "HttpOnly refresh cookie (path `/api/v1/auth`). Optional if sending `refreshToken` in JSON.",
        },
      },
      schemas: {
        ErrorBody: {
          type: "object",
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            requestId: { type: "string" },
            details: {},
          },
        },
        UserPublic: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        AuthTokens: {
          type: "object",
          properties: {
            user: { $ref: "#/components/schemas/UserPublic" },
            accessToken: { type: "string" },
            refreshToken: { type: "string", description: "Also set as HttpOnly cookie when using a browser." },
            expiresIn: { type: "integer", description: "Access token lifetime in seconds" },
          },
        },
        RefreshResponse: {
          type: "object",
          properties: {
            accessToken: { type: "string" },
            refreshToken: { type: "string" },
            expiresIn: { type: "integer" },
          },
        },
        MeResponse: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                sub: { type: "string" },
                email: { type: "string" },
              },
            },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Liveness",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean", example: true },
                      service: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/health/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness (database)",
          responses: {
            "200": { description: "Database reachable" },
            "503": { description: "Database unavailable" },
          },
        },
      },
      "/openapi.json": {
        get: {
          tags: ["Health"],
          summary: "OpenAPI specification (this document)",
          responses: { "200": { description: "OpenAPI JSON" } },
        },
      },
      "/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Register",
          requestBody: jsonRequestBody({
            ...emailPasswordRequestSchema,
            properties: {
              ...emailPasswordRequestSchema.properties,
              password: { type: "string", minLength: 12, maxLength: 128 },
            },
          }),
          responses: {
            ...authTokensResponse("201", "Created"),
            "400": { description: "Validation error" },
            "409": { description: "Email already registered" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login",
          requestBody: jsonRequestBody(emailPasswordRequestSchema),
          responses: {
            ...authTokensResponse("200", "OK"),
            "401": { description: "Invalid credentials" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/auth/refresh": {
        post: {
          tags: ["Auth"],
          summary: "Refresh tokens (rotation)",
          security: [{ refreshCookie: [] }, {}],
          requestBody: refreshTokenOptionalBody,
          responses: {
            "200": {
              description: "New pair",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshResponse" } } },
            },
            "401": { description: "Invalid or expired refresh" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout current session",
          security: [{ refreshCookie: [] }, {}],
          requestBody: refreshTokenOptionalBody,
          responses: {
            "204": { description: "Cookie cleared; session removed when refresh was provided" },
          },
        },
      },
      "/auth/logout-all": {
        post: {
          tags: ["Auth"],
          summary: "Logout all devices",
          security: bearerAuthSecurity,
          responses: {
            "204": { description: "All refresh sessions revoked" },
            ...unauthorizedResponse,
          },
        },
      },
      "/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Current user from access JWT",
          security: bearerAuthSecurity,
          responses: {
            "200": {
              description: "OK",
              content: { "application/json": { schema: { $ref: "#/components/schemas/MeResponse" } } },
            },
            ...unauthorizedResponse,
          },
        },
      },
      "/auth/forgot-password": {
        post: {
          tags: ["Auth"],
          summary: "Request password reset email",
          requestBody: jsonRequestBody({
            type: "object",
            required: ["email"],
            properties: { email: { type: "string", format: "email" } },
          }),
          responses: {
            "200": {
              description: "Generic response (no user enumeration)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/auth/reset-password": {
        post: {
          tags: ["Auth"],
          summary: "Reset password with email token",
          requestBody: jsonRequestBody({
            type: "object",
            required: ["token", "newPassword"],
            properties: {
              token: { type: "string", description: "From email query `token`" },
              newPassword: { type: "string", minLength: 12, maxLength: 128 },
            },
          }),
          responses: {
            "204": { description: "Password updated; all refresh sessions cleared" },
            "400": { description: "Invalid or expired token" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/users/me": {
        get: {
          tags: ["Users"],
          summary: "Current user profile",
          security: bearerAuthSecurity,
          responses: bearerJsonResponses("User object"),
        },
        patch: {
          tags: ["Users"],
          summary: "Update current user",
          security: bearerAuthSecurity,
          responses: bearerJsonResponses("Updated user"),
        },
      },
      "/chats": {
        get: {
          tags: ["Chats"],
          summary: "List chats (cursor pagination)",
          security: bearerAuthSecurity,
          responses: cursorListResponse,
        },
        post: {
          tags: ["Chats"],
          summary: "Create DIRECT or GROUP chat",
          security: bearerAuthSecurity,
          responses: createdOrExistingResponses,
        },
      },
      "/chats/{chatId}/messages": {
        get: {
          tags: ["Chats"],
          summary: "Message history (cursor)",
          security: bearerAuthSecurity,
          parameters: chatIdPathParameter,
          responses: cursorListResponse,
        },
        post: {
          tags: ["Chats"],
          summary: "Send message (clientMessageId idempotent)",
          security: bearerAuthSecurity,
          parameters: chatIdPathParameter,
          responses: createdOrExistingResponses,
        },
      },
      "/friends/request": {
        post: {
          tags: ["Friends"],
          summary: "Send friend request",
          security: bearerAuthSecurity,
          responses: createdOrExistingResponses,
        },
      },
      "/files/{key}": {
        get: {
          tags: ["Files"],
          summary: "Download own upload by storage key",
          security: bearerAuthSecurity,
          parameters: stringPathParameter("key"),
          responses: { "200": { description: "Binary stream" }, "404": { description: "Not found" } },
        },
      },
      "/uploads": {
        post: {
          tags: ["Uploads"],
          summary: "Upload a file (field name: file)",
          security: bearerAuthSecurity,
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: {
                    file: { type: "string", format: "binary" },
                    chatId: {
                      type: "string",
                      format: "uuid",
                      description: "Optional; when set, file is scoped to this chat and members may download.",
                    },
                    voiceNote: {
                      type: "string",
                      enum: ["true", "false", "1", "0"],
                      description: "When true, marks upload as voice (audio MIME only).",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Stored",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      key: { type: "string", description: "Pass to GET /files/{key}" },
                      filename: { type: "string" },
                      size: { type: "integer" },
                      mimetype: { type: "string" },
                      chatId: { type: "string", format: "uuid", nullable: true },
                      kind: {
                        type: "string",
                        enum: ["IMAGE", "DOCUMENT", "AUDIO", "VOICE", "OTHER"],
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "No file or validation error" },
            ...unauthorizedResponse,
            "413": { description: "File too large" },
            "415": { description: "MIME not allowed or content mismatch" },
          },
        },
      },
      "/devices/tokens": {
        get: {
          tags: ["Devices"],
          summary: "List active device tokens (metadata only)",
          security: bearerAuthSecurity,
          responses: { ...deviceTokenListJsonResponse, ...unauthorizedResponse },
        },
        post: {
          tags: ["Devices"],
          summary: "Register or refresh a device push token",
          security: bearerAuthSecurity,
          requestBody: jsonRequestBody({
            type: "object",
            required: ["token", "platform"],
            properties: {
              token: { type: "string", minLength: 1 },
              platform: { type: "string", enum: ["IOS", "ANDROID", "WEB", "UNKNOWN"] },
            },
          }),
          responses: withUnauthorized({
            "200": { description: "Upserted" },
            "400": { description: "Validation error" },
          }),
        },
      },
      "/devices/tokens/revoke": {
        post: {
          tags: ["Devices"],
          summary: "Revoke a device token",
          security: bearerAuthSecurity,
          requestBody: jsonRequestBody({
            type: "object",
            required: ["token"],
            properties: { token: { type: "string", minLength: 1 } },
          }),
          responses: withUnauthorized({
            "200": { description: "Revoked" },
            "404": { description: "Token not found for this user" },
          }),
        },
      },
      "/e2ee/identity": {
        put: e2eeOp("Upsert your public identity key (E2EE)", {
          requestBody: jsonRequestBody({
            type: "object",
            required: ["publicKey", "fingerprint"],
            properties: { publicKey: { type: "string" }, fingerprint: { type: "string" } },
          }),
          responses: withUnauthorized({ "200": { description: "Upserted" } }),
        }),
      },
      "/e2ee/identity/{userId}": {
        get: e2eeOp("Fetch a user's public identity key (E2EE)", {
          parameters: uuidPathParameter("userId"),
          responses: withUnauthorized({
            "200": { description: "OK" },
            "404": { description: "Not found" },
          }),
        }),
      },
      "/e2ee/devices/{deviceId}": {
        put: e2eeOp("Upsert your device public key (E2EE)", {
          parameters: stringPathParameter("deviceId"),
          requestBody: jsonRequestBody({
            type: "object",
            required: ["publicKey"],
            properties: { publicKey: { type: "string" }, label: { type: "string" } },
          }),
          responses: withUnauthorized({ "200": { description: "Upserted" } }),
        }),
      },
      "/e2ee/devices/{userId}": {
        get: e2eeOp("List a user's active devices (E2EE)", {
          parameters: uuidPathParameter("userId"),
          responses: bearerJsonResponses("OK"),
        }),
      },
      "/e2ee/prekeys/{deviceId}": {
        post: e2eeOp("Publish signed + one-time prekeys for your device (E2EE)", {
          parameters: stringPathParameter("deviceId"),
          responses: withUnauthorized({ "201": { description: "Created" } }),
        }),
      },
      "/e2ee/prekeys/{userId}/{deviceId}": {
        get: e2eeOp("Fetch a prekey bundle (consumes one-time key if available)", {
          parameters: [...uuidPathParameter("userId"), ...stringPathParameter("deviceId")],
          responses: withUnauthorized({
            "200": { description: "OK" },
            "404": { description: "Not found" },
          }),
        }),
      },
      "/e2ee/backup": {
        put: e2eeOp("Upsert wrapped key backup (server-blind)", {
          responses: withUnauthorized({ "200": { description: "Upserted" } }),
        }),
        get: e2eeOp("Get wrapped key backup (requires step-up token)", {
          responses: withUnauthorized({
            "200": { description: "OK" },
            "403": { description: "Step-up required" },
          }),
        }),
      },
      "/e2ee/recovery/challenge/email": {
        post: e2eeOp("Send email verification code for recovery (step-up)", {
          responses: withUnauthorized({
            "200": { description: "Sent" },
            "403": { description: "Email not verified" },
          }),
        }),
      },
      "/e2ee/recovery/verify/email": {
        post: e2eeOp("Verify email code and obtain step-up token", {
          responses: withUnauthorized({
            "200": { description: "OK" },
            "400": { description: "Invalid code" },
          }),
        }),
      },
      "/calls/history": {
        get: {
          tags: ["Calls"],
          summary: "List recent call history for current user",
          security: bearerAuthSecurity,
          responses: bearerJsonResponses("OK"),
        },
      },
      "/moderation/blocks": {
        post: {
          tags: ["Moderation"],
          summary: "Block a user",
          security: bearerAuthSecurity,
          requestBody: jsonRequestBody({
            type: "object",
            required: ["blockedUserId"],
            properties: { blockedUserId: { type: "string", format: "uuid" } },
          }),
          responses: withUnauthorized({
            "200": { description: "OK" },
            "429": { description: "Rate limited" },
          }),
        },
      },
      "/moderation/blocks/{blockedUserId}": {
        delete: {
          tags: ["Moderation"],
          summary: "Unblock a user",
          security: bearerAuthSecurity,
          parameters: uuidPathParameter("blockedUserId"),
          responses: withUnauthorized({
            "200": { description: "OK" },
            "429": { description: "Rate limited" },
          }),
        },
      },
      "/moderation/reports": {
        post: {
          tags: ["Moderation"],
          summary: "Create a report (user/message/chat)",
          security: bearerAuthSecurity,
          requestBody: jsonRequestBody({
            type: "object",
            required: ["reason"],
            properties: {
              targetUserId: { type: "string", format: "uuid", nullable: true },
              targetMessageId: { type: "string", format: "uuid", nullable: true },
              chatId: { type: "string", format: "uuid", nullable: true },
              reason: { type: "string" },
              details: { type: "string", nullable: true },
            },
          }),
          responses: withUnauthorized({
            "201": { description: "Created" },
            "403": { description: "Not member" },
            "429": { description: "Rate limited" },
          }),
        },
      },
    },
  };
}
