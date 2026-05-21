import { z } from "zod";

export const postBlockSchema = z.object({
  blockedUserId: z.string().uuid(),
});

export const postReportSchema = z.object({
  targetUserId: z.string().uuid().optional(),
  targetMessageId: z.string().uuid().optional(),
  chatId: z.string().uuid().optional(),
  reason: z.string().min(1).max(80),
  details: z.string().min(1).max(4000).optional(),
});

export const reportStatusSchema = z.enum(["OPEN", "REVIEWED", "DISMISSED", "ACTIONED"]);

export const listAdminReportsQuerySchema = z.object({
  status: reportStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().min(1).optional(),
});

export const patchAdminReportBodySchema = z.object({
  status: reportStatusSchema,
});

