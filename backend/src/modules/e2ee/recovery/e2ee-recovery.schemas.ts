import { z } from "zod";

export const putKeyBackupSchema = z.object({
  version: z.number().int().positive().default(1),
  wrapAlg: z.string().min(1).max(200),
  wrappedPrivateKeyMaterial: z.string().min(1),
});

export const postEmailVerifySchema = z.object({
  code: z.string().min(4).max(12),
});

