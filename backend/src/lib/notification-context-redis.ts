import type { AppConfig } from "../config/index.js";
import { isPlainObject } from "./plain-object.js";
import { getRedisClient } from "./redis-lazy-client.js";

const KEY_PREFIX = "notifyctx:";
const TTL_SEC = 120;

export async function setNotificationContextRedis(
  userId: string,
  tabVisible: boolean,
  activeChatId: string | null,
  config: AppConfig,
): Promise<void> {
  const c = await getRedisClient(config);
  if (!c) return;
  await c.set(
    `${KEY_PREFIX}${userId}`,
    JSON.stringify({ tabVisible, activeChatId }),
    { EX: TTL_SEC },
  );
}

/** True when a context key exists; false when missing; null when Redis is unavailable. */
export async function notificationContextExistsInRedis(
  userId: string,
  config: AppConfig,
): Promise<boolean | null> {
  const c = await getRedisClient(config);
  if (!c) return null;
  const n = await c.exists(`${KEY_PREFIX}${userId}`);
  return n > 0;
}

/** Returns null when Redis is unavailable or key is missing (caller falls back to in-memory). */
export async function isActivelyViewingChatRedis(
  userId: string,
  chatId: string,
  config: AppConfig,
): Promise<boolean | null> {
  const c = await getRedisClient(config);
  if (!c) return null;
  const raw = await c.get(`${KEY_PREFIX}${userId}`);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    return Boolean(parsed.tabVisible && parsed.activeChatId === chatId);
  } catch {
    return null;
  }
}

export async function clearNotificationContextRedis(
  userId: string,
  config: AppConfig,
): Promise<void> {
  const c = await getRedisClient(config);
  if (!c) return;
  await c.del(`${KEY_PREFIX}${userId}`);
}
