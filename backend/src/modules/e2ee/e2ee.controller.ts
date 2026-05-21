import type { Request, Response } from "express";

import { putDeviceKeySchema, putIdentityKeySchema, postPreKeysSchema } from "./e2ee.schemas.js";
import * as e2eeService from "./e2ee.service.js";

export async function putIdentityKey(req: Request, res: Response) {
  const body = putIdentityKeySchema.parse(req.body);
  const row = await e2eeService.upsertIdentityKey(req.user!.sub, body);
  res.status(200).json({ ok: true, data: { userId: row.userId, fingerprint: row.fingerprint, updatedAt: row.updatedAt } });
}

export async function getIdentityKey(req: Request, res: Response) {
  const userId = String(req.params.userId ?? "");
  const row = await e2eeService.getIdentityKey(userId);
  res.status(200).json({ ok: true, data: row });
}

export async function putDeviceKey(req: Request, res: Response) {
  const deviceId = String(req.params.deviceId ?? "");
  const body = putDeviceKeySchema.parse(req.body);
  const row = await e2eeService.upsertDeviceKey(req.user!.sub, deviceId, body);
  res.status(200).json({ ok: true, data: { deviceId: row.deviceId, updatedAt: row.updatedAt } });
}

export async function listDevices(req: Request, res: Response) {
  const userId = String(req.params.userId ?? req.user!.sub);
  const rows = await e2eeService.listUserDevices(userId);
  res.status(200).json({ ok: true, data: rows });
}

export async function postPreKeys(req: Request, res: Response) {
  const deviceId = String(req.params.deviceId ?? "");
  const body = postPreKeysSchema.parse(req.body);
  await e2eeService.publishPreKeys(req.user!.sub, deviceId, {
    signedPreKey: body.signedPreKey,
    oneTimePreKeys: body.oneTimePreKeys,
  });
  res.status(201).json({ ok: true });
}

export async function getPreKeyBundle(req: Request, res: Response) {
  const userId = String(req.params.userId ?? "");
  const deviceId = String(req.params.deviceId ?? "");
  const out = await e2eeService.fetchPreKeyBundle(userId, deviceId);
  res.status(200).json({ ok: true, data: out });
}

