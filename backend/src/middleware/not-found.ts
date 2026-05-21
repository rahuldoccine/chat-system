import type { NextFunction, Request, RequestHandler, Response } from "express";

import { AppError } from "../errors/index.js";

export const notFoundHandler: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  next(new AppError(404, "NOT_FOUND", `Cannot ${req.method} ${req.path}`));
};
