import fs from "node:fs";
import path from "node:path";

import admin from "firebase-admin";

import type { AppConfig } from "../config/index.js";

export class FcmTokenInvalidError extends Error {
  constructor(message = "FCM token invalid") {
    super(message);
    this.name = "FcmTokenInvalidError";
  }
}

function ensureFirebaseApp(config: AppConfig): admin.app.App | null {
  if (!config.fcmProjectId || !config.fcmServiceAccountPath) {
    return null;
  }
  if (admin.apps.length > 0) {
    return admin.app();
  }
  const abs = path.isAbsolute(config.fcmServiceAccountPath)
    ? config.fcmServiceAccountPath
    : path.resolve(process.cwd(), config.fcmServiceAccountPath);
  const raw = fs.readFileSync(abs, "utf8");
  const json = JSON.parse(raw) as admin.ServiceAccount;
  return admin.initializeApp({
    credential: admin.credential.cert(json),
    projectId: config.fcmProjectId,
  });
}

export async function sendFcmDataMessage(
  config: AppConfig,
  token: string,
  payload: { title: string; body?: string; data: Record<string, string> },
): Promise<void> {
  const app = ensureFirebaseApp(config);
  if (!app) {
    return;
  }
  const dataStrings: Record<string, string> = { ...payload.data };
  dataStrings.title = payload.title;
  if (payload.body !== undefined) {
    dataStrings.body = payload.body;
  }
  try {
    await admin.messaging().send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: dataStrings,
      android: { priority: "high" },
      apns: { payload: { aps: { "content-available": 1 } } },
    });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
    if (
      code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/mismatched-credential"
    ) {
      throw new FcmTokenInvalidError(code);
    }
    throw e;
  }
}
