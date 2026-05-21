import type { Request } from "express";

/** Paths browsers (or tools) hit automatically; not useful for API access logs. */
const SILENT_AUTO_LOG_PATHS = new Set([
  "/favicon.ico",
  "/favicon.png",
  "/robots.txt",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
]);

export function shouldSkipHttpAccessLog(req: Request): boolean {
  return SILENT_AUTO_LOG_PATHS.has(req.path);
}

export function isBenignNotFoundProbe(req: Request): boolean {
  return SILENT_AUTO_LOG_PATHS.has(req.path);
}

/** Safe request shape for logs (no Cookie, Authorization, or full header dump). */
export function serializeReqForLog(req: Request): Record<string, unknown> {
  return {
    id: (req as Request & { id?: number | string }).id,
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    query: req.query,
    remoteAddress: req.socket?.remoteAddress,
    remotePort: req.socket?.remotePort,
  };
}
