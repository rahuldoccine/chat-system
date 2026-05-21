import type { Request, Response } from "express";

import { parseBody } from "../../validation/validate.js";
import {
  registerDeviceTokenBodySchema,
  registerWebPushBodySchema,
  revokeDeviceTokenBodySchema,
} from "./devices.schemas.js";
import * as devicesService from "./devices.service.js";

export async function postToken(req: Request, res: Response): Promise<void> {
  const body = parseBody(registerDeviceTokenBodySchema, req.body);
  const row = await devicesService.registerDeviceToken(req.user!.sub, body.token, body.platform);
  res.status(201).json({ deviceToken: row });
}

export async function postWebPush(req: Request, res: Response): Promise<void> {
  const body = parseBody(registerWebPushBodySchema, req.body);
  const row = await devicesService.registerWebPushSubscription(req.user!.sub, body);
  res.status(201).json({ deviceToken: row });
}

export async function postRevoke(req: Request, res: Response): Promise<void> {
  const body = parseBody(revokeDeviceTokenBodySchema, req.body);
  await devicesService.revokeDeviceToken(req.user!.sub, body.token);
  res.status(204).end();
}

export async function listTokens(req: Request, res: Response): Promise<void> {
  const rows = await devicesService.listDeviceTokens(req.user!.sub);
  res.json({ data: rows });
}
