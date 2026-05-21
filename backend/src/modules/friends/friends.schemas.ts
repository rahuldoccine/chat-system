import { z } from "zod";

export const friendRequestBodySchema = z
  .object({
    addresseeId: z.string().uuid().optional(),
    email: z.string().email().optional(),
  })
  .refine((d) => Boolean(d.addresseeId || d.email), { message: "addresseeId or email required" });

export const friendActionBodySchema = z.object({
  friendId: z.string().uuid(),
});

export const friendListQuerySchema = z.object({
  status: z.enum(["accepted", "incoming", "outgoing"]),
});
