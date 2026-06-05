import fs from "node:fs/promises";
import path from "node:path";

import { fileTypeFromFile } from "file-type";
import { Router } from "express";

import type { AppConfig } from "../../config/index.js";
import { AppError } from "../../errors/index.js";
import { createUploadMiddleware } from "../../lib/multer-upload.js";
import { requireActiveMember } from "../../lib/chat-access.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  inferUploadKind,
  isAllowedUploadMime,
  isVoiceCapableMime,
  safeExtensionForMime,
} from "../../lib/upload-allowlist.js";
import { resolveUploadMime } from "../../lib/mime-compatibility.js";
import {
  fileDownloadPath,
  placeUploadedFile,
  resolveUploadCategory,
} from "../../lib/upload-storage.js";
import type { Logger } from "../../lib/logger.js";
import { createRequireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";

import { parseUploadFormFields } from "./uploads.schemas.js";

export function createUploadsRouter(config: AppConfig, logger?: Logger): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  const uploadMw = createUploadMiddleware(config);

  router.post(
    "/",
    requireAuth,
    (req, res, next) => {
      const upload = uploadMw.single("file");
      upload(req, res, (err) => {
        if (err) {
          next(err);
          return;
        }
        next();
      });
    },
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new AppError(400, "NO_FILE", 'Expected multipart field "file"');
      }

      const fields = parseUploadFormFields(req.body);
      const prisma = getPrisma();

      if (fields.chatId) {
        await requireActiveMember(req.user!.sub, fields.chatId);
      }

      const category = await resolveUploadCategory(fields.chatId);

      if (fields.voiceNote && !isVoiceCapableMime(req.file.mimetype)) {
        await fs.unlink(path.join(config.uploadDir, req.file.filename)).catch(() => {});
        throw new AppError(400, "INVALID_VOICE", "voiceNote is only valid for audio uploads");
      }

      const absPath = path.join(config.uploadDir, req.file.filename);
      let storedMime =
        req.file.mimetype.toLowerCase().split(";")[0]?.trim() ?? "";

      const sniff = await fileTypeFromFile(absPath).catch(() => undefined);
      if (sniff && !isAllowedUploadMime(sniff.mime)) {
        await fs.unlink(absPath).catch(() => {});
        throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "File content type not allowed");
      }

      const resolved = resolveUploadMime(sniff?.mime, storedMime);
      if (!resolved.compatible) {
        logger?.warn(
          `Upload MIME mismatch: declared=${storedMime} sniffed=${sniff?.mime ?? "unknown"} file=${req.file.originalname}`,
        );
        await fs.unlink(absPath).catch(() => {});
        throw new AppError(400, "MIME_MISMATCH", "File content does not match declared type");
      }
      storedMime = resolved.mime;

      let tempName = req.file.filename;
      const correctExt = safeExtensionForMime(storedMime);
      if (correctExt && !tempName.toLowerCase().endsWith(correctExt)) {
        const base = path.basename(tempName, path.extname(tempName));
        const renamed = `${base}${correctExt}`;
        const renamedPath = path.join(config.uploadDir, renamed);
        await fs.rename(absPath, renamedPath).catch(() => {});
        tempName = renamed;
        req.file.filename = renamed;
      }

      const placed = await placeUploadedFile(
        config.uploadDir,
        tempName,
        category,
        storedMime,
        req.file.originalname,
      );
      const storageKey = placed.storageKey;

      const kind = inferUploadKind(storedMime, { voiceNote: fields.voiceNote });

      let fileRecord;
      try {
        fileRecord = await prisma.uploadedFile.create({
          data: {
            userId: req.user!.sub,
            chatId: fields.chatId ?? null,
            storageKey,
            mimeType: storedMime,
            size: req.file.size,
            kind,
          },
        });
      } catch (e) {
        await fs.unlink(placed.absolutePath).catch(() => {});
        throw e;
      }

      res.status(201).json({
        id: fileRecord.id,
        key: storageKey,
        filename: storageKey,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: storedMime,
        chatId: fields.chatId ?? null,
        kind,
        category,
        url: fileDownloadPath(storageKey),
      });
    }),
  );

  return router;
}
