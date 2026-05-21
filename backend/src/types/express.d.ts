import type { AccessTokenPayload } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      requestId: string;
    }
  }
}

export {};
