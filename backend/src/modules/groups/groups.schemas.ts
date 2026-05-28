import { z } from "zod";

export const patchGroupBodySchema = z.object({
  title: z.string().min(1).max(120).optional(),
  /** File name, storage key, or legacy URL — normalized on save. */
  avatarUrl: z.string().min(1).max(512).nullable().optional(),
  groupVisibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
});

export const addGroupMemberBodySchema = z.object({
  userId: z.string().uuid(),
});

export const patchGroupMemberRoleBodySchema = z.object({
  role: z.enum(["ADMIN", "MOD", "MEMBER"]),
});
