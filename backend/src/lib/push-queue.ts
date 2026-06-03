import webpush, { type PushSubscription } from "web-push";

import { loadConfig, type AppConfig } from "../config/index.js";
import { markDeviceTokenRevokedByFcm } from "../modules/devices/devices.service.js";

import { FcmTokenInvalidError, sendFcmDataMessage } from "./fcm.js";
import { isPlainObject } from "./plain-object.js";
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
    const o: unknown = JSON.parse(token);
    if (!isPlainObject(o)) return null;
    const rec = o;
    if (typeof rec.endpoint !== "string" || !isPlainObject(rec.keys)) return null;
    const keys = rec.keys;
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

function configureWebPushVapid(config: AppConfig): void {
  if (!config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject) return;
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
}

function webPushStatusCode(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("statusCode" in err)) return undefined;
  return (err as { statusCode?: number }).statusCode;
}

function isInvalidFcmToken(err: unknown): boolean {
  return (
    err instanceof FcmTokenInvalidError ||
    (err instanceof Error && err.name === "FcmTokenInvalidError")
  );
}

function pushMessageCopy(job: PushNotificationJob): { title: string; body: string } {
  return {
    title: job.title ?? "New message",
    body: job.body ?? "You have a new message",
  };
}

async function deliverWebPushToToken(
  row: { token: string },
  sub: PushSubscription,
  job: PushNotificationJob,
): Promise<Error | null> {
  const copy = pushMessageCopy(job);
  const payload = JSON.stringify({
    title: copy.title,
    body: copy.body,
    chatId: job.chatId,
    messageId: job.messageId,
    url: `/?chat=${job.chatId}`,
  });
  try {
    await webpush.sendNotification(sub, payload, { TTL: 3600 });
    return null;
  } catch (e: unknown) {
    const status = webPushStatusCode(e);
    if (status === 404 || status === 410) {
      await markDeviceTokenRevokedByFcm(row.token);
      return null;
    }
    return e instanceof Error ? e : new Error(String(e));
  }
}

async function deliverFcmToToken(
  row: { token: string },
  job: PushNotificationJob,
  config: AppConfig,
): Promise<Error | null> {
  const copy = pushMessageCopy(job);
  try {
    await sendFcmDataMessage(config, row.token, {
      title: copy.title,
      body: copy.body,
      data: {
        kind: "message",
        chatId: job.chatId,
        messageId: job.messageId,
      },
    });
    return null;
  } catch (e: unknown) {
    if (isInvalidFcmToken(e)) {
      await markDeviceTokenRevokedByFcm(row.token);
      return null;
    }
    return e instanceof Error ? e : new Error(String(e));
  }
}

async function deliverTokenPush(
  row: { token: string },
  job: PushNotificationJob,
  config: AppConfig,
  fcmOk: boolean,
  webOk: boolean,
): Promise<Error | null> {
  const sub = parseWebPushSubscription(row.token);
  if (sub && webOk) {
    return deliverWebPushToToken(row, sub, job);
  }
  if (!fcmOk) return null;
  return deliverFcmToToken(row, job, config);
}

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
    configureWebPushVapid(config);
  }

  let transientErr: Error | null = null;
  for (const row of tokens) {
    const err = await deliverTokenPush(row, job, config, fcmOk, webOk);
    if (err) transientErr = err;
  }
  if (transientErr) {
    throw transientErr;
  }
}

function pushRetryDelayMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** attempt);
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function attemptPushDelivery(job: PushNotificationJob, attempt: number): Promise<boolean> {
  const config = loadConfig();
  try {
    await deliverPushOnce(job, config);
    return true;
  } catch (e) {
    workerLogger?.warn({ err: e, attempt, ...job }, "push job failed, will retry");
    return false;
  }
}

async function runPushJobWithRetries(job: PushNotificationJob): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const delivered = await attemptPushDelivery(job, attempt);
    if (delivered) return;
    if (attempt === MAX_ATTEMPTS - 1) {
      workerLogger?.error({ ...job }, "push job abandoned after max retries");
      return;
    }
    await sleepMs(pushRetryDelayMs(attempt));
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
