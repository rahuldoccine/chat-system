import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

import type { AppConfig } from "../config/index.js";
import { UnauthorizedError } from "../errors/index.js";

/** Custom claim to distinguish access vs future token types (avoid JWT header `typ` collision). */
const ACCESS_USE = "access" as const;

export type AccessTokenPayload = {
  sub: string;
  email?: string;
  authVer?: number;
};

export function signAccessToken(payload: AccessTokenPayload, config: AppConfig): string {
  const body = {
    sub: payload.sub,
    tokenUse: ACCESS_USE,
    authVer: payload.authVer ?? 0,
    ...(payload.email ? { email: payload.email } : {}),
  };
  const options = { expiresIn: config.jwtExpiresIn } as SignOptions;
  return jwt.sign(body, config.jwtAccessSecret, options);
}

export function signAccessTokenWithExpiry(
  payload: AccessTokenPayload,
  config: AppConfig,
): { token: string; expiresIn: number } {
  const token = signAccessToken(payload, config);
  const decoded = jwt.decode(token) as JwtPayload | null;
  const exp = decoded?.exp;
  const iat = decoded?.iat;
  const expiresIn = exp != null && iat != null ? Math.max(1, exp - iat) : 900;
  return { token, expiresIn };
}

export function verifyAccessToken(token: string, config: AppConfig): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwtAccessSecret);
    if (typeof decoded === "string" || typeof decoded !== "object" || decoded === null) {
      throw new UnauthorizedError("Invalid token");
    }
    const payload = decoded as JwtPayload & { tokenUse?: string };
    if (payload.tokenUse !== ACCESS_USE) {
      throw new UnauthorizedError("Invalid token type");
    }
    const sub = payload.sub;
    if (!sub || typeof sub !== "string") {
      throw new UnauthorizedError("Invalid token subject");
    }
    const email = payload.email;
    return {
      sub,
      ...(typeof email === "string" ? { email } : {}),
    };
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      throw e;
    }
    throw new UnauthorizedError("Invalid or expired token");
  }
}
