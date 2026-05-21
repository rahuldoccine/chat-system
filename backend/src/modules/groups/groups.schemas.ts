import { z } from "zod";

export const patchGroupBodySchema = z.object({
  title: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export const addGroupMemberBodySchema = z.object({
  userId: z.string().uuid(),
});

export const patchGroupMemberRoleBodySchema = z.object({
  role: z.enum(["ADMIN", "MOD", "MEMBER"]),
});
