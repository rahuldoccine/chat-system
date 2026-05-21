import type { z } from "zod";

import { ValidationError } from "../errors/index.js";

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError("Invalid request body", result.error.flatten());
  }
  return result.data;
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, query: unknown): z.infer<T> {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new ValidationError("Invalid query parameters", result.error.flatten());
  }
  return result.data;
}
