import type { Request, Response } from "express";

import { getPrisma } from "../../lib/prisma.js";

export async function getHealth(_req: Request, res: Response): Promise<void> {
  res.json({ ok: true, service: "mernchat-backend" });
}

export async function getReady(req: Request, res: Response): Promise<void> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false, requestId: req.requestId });
  }
}
