import { z } from "zod";

export const registerDeviceTokenBodySchema = z.object({
  token: z.string().min(10).max(4096),
  platform: z.enum(["IOS", "ANDROID", "WEB", "UNKNOWN"]).optional().default("UNKNOWN"),
});

export const revokeDeviceTokenBodySchema = z.object({
  token: z.string().min(10).max(4096),
});

export const registerWebPushBodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(10),
  }),
});
