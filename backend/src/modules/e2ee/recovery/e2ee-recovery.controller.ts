import type { Request, Response } from "express";

import type { AppConfig } from "../../../config/index.js";
import type { Logger } from "../../../lib/logger.js";
import { AppError } from "../../../errors/index.js";

import { postEmailVerifySchema, putKeyBackupSchema } from "./e2ee-recovery.schemas.js";
import * as recoveryService from "./e2ee-recovery.service.js";

export function createE2eeRecoveryHandlers(config: AppConfig, logger: Logger) {
  return {
    putBackup: async (req: Request, res: Response) => {
      const body = putKeyBackupSchema.parse(req.body);
      const row = await recoveryService.upsertKeyBackup(req.user!.sub, body);
      res.status(200).json({ ok: true, data: { version: row.version, wrapAlg: row.wrapAlg, updatedAt: row.updatedAt } });
    },

    postEmailChallenge: async (req: Request, res: Response) => {
      await recoveryService.issueRecoveryEmailChallenge(req.user!.sub, config, logger);
      res.status(200).json({ ok: true });
    },

    postEmailVerify: async (req: Request, res: Response) => {
      const body = postEmailVerifySchema.parse(req.body);
      const out = await recoveryService.verifyRecoveryEmailCode(req.user!.sub, body.code, config);
      res.status(200).json({ ok: true, data: out });
    },

    getBackup: async (req: Request, res: Response) => {
      const token = String(req.header("x-step-up-token") ?? "");
      if (!token) {
        throw new AppError(403, "STEP_UP_REQUIRED", "Step-up verification required");
      }
      await recoveryService.requireStepUpToken(req.user!.sub, token, config);
      const row = await recoveryService.getKeyBackup(req.user!.sub);
      res.status(200).json({ ok: true, data: row });
    },

    /** Whether a wrapped key backup exists (no key material returned). */
    getBackupStatus: async (req: Request, res: Response) => {
      const status = await recoveryService.getAccountKeyStatus(req.user!.sub);
      res.status(200).json({ ok: true, data: status });
    },

    /** Restore keys on a new browser after sign-in (session auth; ciphertext still opaque to server). */
    getBackupAccount: async (req: Request, res: Response) => {
      const row = await recoveryService.getKeyBackup(req.user!.sub);
      res.status(200).json({
        ok: true,
        data: {
          wrapAlg: row.wrapAlg,
          wrappedPrivateKeyMaterial: row.wrappedPrivateKeyMaterial,
        },
      });
    },
  };
}

