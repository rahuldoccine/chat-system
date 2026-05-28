import { z } from "zod";

export const patchMeBodySchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores")
    .optional()
    .nullable(),
  /** File name (e.g. uuid.jpg), storage key (logos/uuid.jpg), or legacy full URL — normalized on save. */
  avatarUrl: z.string().min(1).max(512).optional().nullable(),
  publicKey: z.string().max(16_384).optional().nullable(),
  keyVersion: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
});

export const userSearchQuerySchema = z.object({
  q: z.string().max(100).optional().default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PatchMeBody = z.infer<typeof patchMeBodySchema>;

export const patchSettingsBodySchema = z
  .object({
    notifyPush: z.boolean().optional(),
    notifyEmail: z.boolean().optional(),
    showReadReceipts: z.boolean().optional(),
  })
  .strict();

export type PatchSettingsBody = z.infer<typeof patchSettingsBodySchema>;
