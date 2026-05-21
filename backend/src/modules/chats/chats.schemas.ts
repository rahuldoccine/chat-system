import { z } from "zod";

export const createChatBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("DIRECT"),
    otherUserId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("GROUP"),
    title: z.string().min(1).max(120),
    memberIds: z.array(z.string().uuid()).max(200).optional(),
  }),
]);

export const listMessagesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  })
  .transform((o) => ({ ...o, limit: o.limit ?? 50 }));

export const searchMessagesQuerySchema = z
  .object({
    q: z.string().min(1).max(200),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    cursor: z.string().optional(),
  })
  .transform((o) => ({ ...o, limit: o.limit ?? 20 }));

export const linkPreviewQuerySchema = z.object({
  url: z.string().url().max(2048),
});

export const createMessageBodySchema = z.object({
  clientMessageId: z.string().min(1).max(128),
  kind: z
    .enum(["TEXT", "IMAGE", "FILE", "SYSTEM", "POLL", "OTHER"])
    .optional()
    .default("TEXT"),
  ciphertext: z.string().max(512_000).optional().nullable(),
  contentMeta: z.record(z.unknown()).optional().nullable(),
  replyToId: z.string().uuid().optional().nullable(),
});

export const listChatsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    cursor: z.string().optional(),
    type: z.enum(["DIRECT", "GROUP"]).optional(),
  })
  .transform((o) => ({ ...o, limit: o.limit ?? 30 }));

export const createPollBodySchema = z
  .object({
    question: z.string().max(500),
    closesAt: z.coerce.date().optional().nullable(),
    options: z.array(z.string().max(200)).min(2).max(20),
    /** E2EE DM: encrypted poll payload (question/options live in ciphertext meta). */
    ciphertext: z.string().min(1).max(512_000).optional(),
    contentMeta: z.record(z.unknown()).optional(),
    clientMessageId: z.string().uuid().optional(),
  })
  .superRefine((body, ctx) => {
    const isE2ee = Boolean(body.ciphertext && body.contentMeta);
    if (isE2ee) return;
    if (!body.question.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Question is required", path: ["question"] });
    }
    if (body.options.some((o) => !o.trim())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Options cannot be empty", path: ["options"] });
    }
  });

export const votePollBodySchema = z.object({
  pollOptionId: z.string().uuid(),
});

export const patchMessageBodySchema = z.object({
  ciphertext: z.string().max(512_000).optional().nullable(),
  contentMeta: z.record(z.unknown()).optional().nullable(),
});

export const patchChatMuteBodySchema = z.object({
  /** ISO-8601 datetime to mute until, or `null` to unmute. */
  mutedUntil: z.union([z.string().min(1), z.null()]),
});

export const patchChatE2eeBodySchema = z.object({
  e2eeMode: z.enum(["NONE", "DM_V1"]),
});

export const markMessagesReadBodySchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(200),
});

export const markMessagesDeliveredBodySchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(200),
});
