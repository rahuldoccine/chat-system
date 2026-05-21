import { createHmac, randomBytes } from "node:crypto";

export function hashOpaqueToken(raw: string, secret: string): string {
  return createHmac("sha256", secret).update(raw).digest("hex");
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}
