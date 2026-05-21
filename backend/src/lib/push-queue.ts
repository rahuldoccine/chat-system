import webpush, { type PushSubscription } from "web-push";

import { loadConfig, type AppConfig } from "../config/index.js";
import { markDeviceTokenRevokedByFcm } from "../modules/devices/devices.service.js";

import { FcmTokenInvalidError, sendFcmDataMessage } from "./fcm.js";
import type { Logger } from "./logger.js";
import { getPrisma } from "./prisma.js";

const DEDUPE_TTL_MS = 3_600_000;
const MAX_ATTEMPTS = 6;

const dedupe = new Map<string, number>();

let workerLogger: Logger | null = null;
let chain: Promise<void> = Promise.resolve();

export function setPushWorkerLogger(logger: Logger): void {
  workerLogger = logger;
}

function pruneDedupe(now: number): void {
  for (const [k, exp] of dedupe) {
    if (exp < now) {
      dedupe.delete(k);
    }
  }
}

function dedupeKey(userId: string, messageId: string): string {
  return `${userId}:${messageId}`;
}

/** Wait until queued push jobs finish (for tests). */
export function waitForPushQueueIdle(): Promise<void> {
  return chain;
}

function parseWebPushSubscription(token: string): PushSubscription | null {
  try {
    const o = JSON.parse(token) as unknown;
    if (!o || typeof o !== "object") return null;
    const rec = o as Record<string, unknown>;
    if (typeof rec.endpoint !== "string" || !rec.keys || typeof rec.keys !== "object") return null;
    const keys = rec.keys as Record<string, unknown>;
    if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
    return { endpoint: rec.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
  } catch {
    return null;
  }
}

function pushTransportEnabled(config: AppConfig): boolean {
  const fcm = Boolean(config.fcmProjectId && config.fcmServiceAccountPath);
  const vapid = Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject);
  return fcm || vapid;
}

export type PushNotificationJob = {
  userId: string;
  chatId: string;
  messageId: string;
  title?: string;
  body?: string;
};

async function deliverPushOnce(job: PushNotificationJob, config: AppConfig): Promise<void> {
  if (!pushTransportEnabled(config)) {
    return;
  }
  const prisma = getPrisma();
  const tokens = await prisma.deviceToken.findMany({
    where: { userId: job.userId, revokedAt: null },
  });
  const fcmOk = Boolean(config.fcmProjectId && config.fcmServiceAccountPath);
  const webOk = Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject);
  if (webOk) {
    webpush.setVapidDetails(
      config.vapidSubject!,
      config.vapidPublicKey!,
      config.vapidPrivateKey!,
    );
  }

  let transientErr: unknown = null;
  for (const row of tokens) {
    const sub = parseWebPushSubscription(row.token);
    if (sub && webOk) {
      try {
        const payload = JSON.stringify({
          title: job.title ?? "New message",
          body: job.body ?? "You have a new message",
          chatId: job.chatId,
          messageId: job.messageId,
          url: `/?chat=${job.chatId}`,
        });
        await webpush.sendNotification(sub, payload, { TTL: 3600 });
      } catch (e: unknown) {
        const status =
          typeof e === "object" && e !== null && "statusCode" in e
            ? (e as { statusCode?: number }).statusCode
            : undefined;
        if (status === 404 || status === 410) {
          await markDeviceTokenRevokedByFcm(row.token);
        } else {
          transientErr = e;
        }
      }
      continue;
    }

    if (!fcmOk) continue;
    try {
      await sendFcmDataMessage(config, row.token, {
        title: job.title ?? "New message",
        body: job.body ?? "You have a new message",
        data: {
          kind: "message",
          chatId: job.chatId,
          messageId: job.messageId,
        },
      });
    } catch (e: unknown) {
      const invalidToken =
        e instanceof FcmTokenInvalidError ||
        (e instanceof Error && e.name === "FcmTokenInvalidError");
      if (invalidToken) {
        await markDeviceTokenRevokedByFcm(row.token);
      } else {
        transientErr = e;
      }
    }
  }
  if (transientErr) {
    throw transientErr;
  }
}

async function runPushJobWithRetries(job: PushNotificationJob): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const config = loadConfig();
    try {
      await deliverPushOnce(job, config);
      return;
    } catch (e) {
      workerLogger?.warn({ err: e, attempt, ...job }, "push job failed, will retry");
      if (attempt === MAX_ATTEMPTS - 1) {
        workerLogger?.error({ err: e, ...job }, "push job abandoned after max retries");
        return;
      }
      const delayMs = Math.min(30_000, 500 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/**
 * Enqueue a push for one recipient + message. Dedupes on (userId, messageId).
 * Returns false when no push channel is configured or this pair was already queued recently.
 */
export function enqueuePushNotification(job: PushNotificationJob): boolean {
  const config = loadConfig();
  if (!pushTransportEnabled(config)) {
    return false;
  }
  const key = dedupeKey(job.userId, job.messageId);
  const now = Date.now();
  pruneDedupe(now);
  if (dedupe.has(key)) {
    return false;
  }
  dedupe.set(key, now + DEDUPE_TTL_MS);
  chain = chain.then(() => runPushJobWithRetries(job));
  return true;
}
