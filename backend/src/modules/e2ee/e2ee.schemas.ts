import { z } from "zod";

export const putIdentityKeySchema = z.object({
  publicKey: z.string().min(1),
  fingerprint: z.string().min(1).max(256),
});

export const putDeviceKeySchema = z.object({
  publicKey: z.string().min(1),
  label: z.string().min(1).max(80).optional(),
});

export const signedPreKeySchema = z.object({
  keyId: z.string().min(1).max(200),
  publicKey: z.string().min(1),
  signature: z.string().min(1),
});

export const oneTimePreKeySchema = z.object({
  keyId: z.string().min(1).max(200),
  publicKey: z.string().min(1),
});

export const postPreKeysSchema = z.object({
  signedPreKey: signedPreKeySchema,
  oneTimePreKeys: z.array(oneTimePreKeySchema).max(200).default([]),
});

