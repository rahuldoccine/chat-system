import jwt, { type JwtPayload } from "jsonwebtoken";

import type { AppConfig } from "../config/index.js";
import { UnauthorizedError } from "../errors/index.js";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt.js";
import { getPrisma } from "./prisma.js";

function authVerFromDecoded(token: string): number {
  const decoded = jwt.decode(token) as JwtPayload & { authVer?: unknown } | null;
  if (decoded && typeof decoded.authVer === "number" && Number.isInteger(decoded.authVer)) {
    return decoded.authVer;
  }
  return 0;
}

/**
 * Verifies JWT signature/expiry and ensures the token was issued after the user's
 * last global sign-out (authVersion bump).
 */
export async function verifyAccessTokenActive(
  token: string,
  config: AppConfig,
): Promise<AccessTokenPayload> {
  const payload = verifyAccessToken(token, config);
  const tokenVer = authVerFromDecoded(token);

  const user = await getPrisma().user.findUnique({
    where: { id: payload.sub },
    select: { authVersion: true },
  });

  if (user?.authVersion !== tokenVer) {
    throw new UnauthorizedError("Session revoked");
  }

  return payload;
}
