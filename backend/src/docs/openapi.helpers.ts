/** Reusable OpenAPI fragments to reduce path-definition duplication. */

export const bearerAuthSecurity = [{ bearerAuth: [] }] as const;

export const unauthorizedResponse = {
  "401": { description: "Missing or invalid access token" },
} as const;

export const bearerGetResponses = (okDescription: string, schemaRef: string) =>
  ({
    "200": {
      description: okDescription,
      content: { "application/json": { schema: { $ref: schemaRef } } },
    },
    ...unauthorizedResponse,
  }) as const;

/** Typical authenticated route responses (200/204 + 401). */
export const bearerOkResponses = {
  okJson: (description: string) => ({ "200": { description } }),
  okWithRef: (description: string, schemaRef: string) => ({
    "200": {
      description,
      content: { "application/json": { schema: { $ref: schemaRef } } },
    },
  }),
  noContent: { "204": { description: "No content" } },
  ...unauthorizedResponse,
} as const;

export function bearerJsonResponses(description: string, schemaRef?: string) {
  if (schemaRef) {
    return { ...bearerOkResponses.okWithRef(description, schemaRef), ...unauthorizedResponse };
  }
  return { ...bearerOkResponses.okJson(description), ...unauthorizedResponse };
}

/** Append standard 401 to any response map. */
export function withUnauthorized<T extends Record<string, { description: string }>>(responses: T) {
  return { ...responses, ...unauthorizedResponse };
}

export const chatIdPathParameter = [
  { name: "chatId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
] as const;

export function uuidPathParameter(name: string) {
  return [{ name, in: "path", required: true, schema: { type: "string", format: "uuid" } }] as const;
}

export function stringPathParameter(name: string) {
  return [{ name, in: "path", required: true, schema: { type: "string" } }] as const;
}

export function jsonRequestBody(schema: Record<string, unknown>, required = true) {
  return {
    required,
    content: { "application/json": { schema } },
  } as const;
}

export const emailPasswordRequestSchema = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string" },
  },
} as const;

export function authTokensResponse(status: "200" | "201", description: string) {
  return {
    [status]: {
      description,
      content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokens" } } },
    },
  } as const;
}

export const refreshTokenOptionalBody = {
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          refreshToken: { type: "string", description: "Required if refresh cookie not sent." },
        },
      },
    },
  },
} as const;

export const cursorListResponse = { "200": { description: "data + nextCursor" } } as const;

export const createdOrExistingResponses = {
  "201": { description: "Created" },
  "200": { description: "Existing or idempotent replay" },
} as const;

export const deviceTokenListJsonResponse = {
  "200": {
    description: "OK",
    content: {
      "application/json": {
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              platform: { type: "string", enum: ["IOS", "ANDROID", "WEB", "UNKNOWN"] },
              createdAt: { type: "string", format: "date-time" },
              lastUsedAt: { type: "string", format: "date-time", nullable: true },
            },
          },
        },
      },
    },
  },
} as const;
