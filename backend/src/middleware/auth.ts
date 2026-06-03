import type { NextFunction, Request, RequestHandler, Response } from "express";

import { UnauthorizedError } from "../errors/index.js";
import type { AppConfig } from "../config/index.js";
import { verifyAccessTokenActive } from "../lib/validate-access-token.js";

function extractBearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (!h || typeof h !== "string") {
    return undefined;
  }
  const [type, token] = h.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }
  return token.trim();
}

function extractAccessToken(req: Request): string | undefined {
  const bearer = extractBearer(req);
  if (bearer) return bearer;
  const queryToken = req.query.token;
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }
  return undefined;
}

export function createRequireAuth(config: AppConfig): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const token = extractBearer(req);
        if (!token) {
          throw new UnauthorizedError("Missing bearer token");
        }
        req.user = await verifyAccessTokenActive(token, config);
        next();
      } catch (e) {
        next(e instanceof UnauthorizedError ? e : new UnauthorizedError("Invalid token"));
      }
    })();
  };
}

/** Bearer header or `?token=` query param (for protected file URLs in img src). */
export function createRequireAuthOrQueryToken(config: AppConfig): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const token = extractAccessToken(req);
        if (!token) {
          throw new UnauthorizedError("Missing access token");
        }
        req.user = await verifyAccessTokenActive(token, config);
        next();
      } catch (e) {
        next(e instanceof UnauthorizedError ? e : new UnauthorizedError("Invalid token"));
      }
    })();
  };
}
