import { randomUUID } from "node:crypto";
import path from "node:path";

import multer from "multer";

import type { AppConfig } from "../config/index.js";
import { AppError } from "../errors/index.js";

import {
  isDangerousOriginalName,
  resolveDeclaredUploadMime,
  safeExtensionForMime,
} from "./upload-allowlist.js";

export function createUploadMiddleware(config: AppConfig): multer.Multer {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, config.uploadDir);
    },
    filename: (_req, file, cb) => {
      const mime = file.mimetype.toLowerCase().split(";")[0]?.trim() ?? "";
      const ext = safeExtensionForMime(mime) || path.extname(file.originalname).slice(0, 8).toLowerCase();
      const safeExt = ext && /^\.[a-z0-9]+$/i.test(ext) ? ext : "";
      cb(null, `${randomUUID()}${safeExt || ""}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: config.maxUploadBytes },
    fileFilter: (_req, file, cb) => {
      if (isDangerousOriginalName(file.originalname)) {
        cb(new AppError(400, "INVALID_FILENAME", "This file extension is not allowed"));
        return;
      }
      const resolved = resolveDeclaredUploadMime(file.originalname, file.mimetype);
      if (!resolved) {
        cb(new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "File type not allowed"));
        return;
      }
      file.mimetype = resolved;
      cb(null, true);
    },
  });
}
