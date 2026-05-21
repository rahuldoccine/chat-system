import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers["x-request-id"] as string | undefined)?.trim() || randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
