import type { NextFunction, Request, RequestHandler, Response } from "express";

import { AppError } from "../errors/index.js";
import { getPrisma } from "../lib/prisma.js";

export function createRequirePlatformAdmin(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    void (async () => {
      try {
        const userId = req.user?.sub;
        if (!userId) {
          throw new AppError(401, "UNAUTHORIZED", "Authentication required");
        }
        const prisma = getPrisma();
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { isAdmin: true, deletedAt: true },
        });
        if (!user || user.deletedAt || !user.isAdmin) {
          throw new AppError(403, "FORBIDDEN", "Platform admin access required");
        }
        next();
      } catch (e) {
        next(e);
      }
    })();
  };
}
