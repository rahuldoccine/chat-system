import fs from "node:fs";
import path from "node:path";

import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import { AppError } from "../../errors/index.js";
import { getPrisma } from "../../lib/prisma.js";
import { shouldForceAttachmentDisposition } from "../../lib/upload-allowlist.js";
import { userCanAccessUploadedFile } from "../../lib/upload-access.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";

import { verifyAccessTokenActive } from "../../lib/validate-access-token.js";

export function createFilesRouter(config: AppConfig): Router {
  const router = Router();

  const requireAuthOrQueryToken = (req: any, res: any, next: any) => {
    void (async () => {
      try {
        let token: string | undefined;
        const h = req.headers.authorization;
        if (h && typeof h === "string") {
          const [type, t] = h.split(" ");
          if (type?.toLowerCase() === "bearer" && t) {
            token = t.trim();
          }
        }
        if (!token && req.query.token && typeof req.query.token === "string") {
          token = req.query.token;
        }
        if (!token) {
          throw new AppError(401, "UNAUTHORIZED", "Missing access token");
        }
        req.user = await verifyAccessTokenActive(token, config);
        next();
      } catch (e) {
        next(new AppError(401, "UNAUTHORIZED", "Invalid token"));
      }
    })();
  };

  router.get(
    "/:key",
    requireAuthOrQueryToken,
    asyncHandler(async (req, res) => {
      const key = req.params.key as string;
      if (!key || key !== path.basename(key) || key.includes("..")) {
        throw new AppError(400, "INVALID_KEY", "Invalid file key");
      }

      const prisma = getPrisma();
      const file = await prisma.uploadedFile.findUnique({ where: { storageKey: key } });
      if (!file) {
        throw new AppError(404, "NOT_FOUND", "File not found");
      }
      const userId = req.user!.sub;
      if (!(await userCanAccessUploadedFile(userId, file))) {
        throw new AppError(404, "NOT_FOUND", "File not found");
      }

      const root = path.resolve(config.uploadDir);
      const abs = path.resolve(root, key);
      if (abs !== root && !abs.startsWith(root + path.sep)) {
        throw new AppError(400, "INVALID_KEY", "Invalid file key");
      }
      if (!fs.existsSync(abs)) {
        throw new AppError(404, "NOT_FOUND", "File missing on disk");
      }

      res.setHeader("Content-Type", file.mimeType);
      // Allow <img> / media from the Vite dev server (different port than API)
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      if (shouldForceAttachmentDisposition(file.mimeType)) {
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(key)}"`);
      }
      fs.createReadStream(abs).pipe(res);
    }),
  );

  return router;
}
