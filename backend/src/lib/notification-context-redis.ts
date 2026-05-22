import { createClient } from "redis";

import type { AppConfig } from "../config/index.js";

const KEY_PREFIX = "notifyctx:";
const TTL_SEC = 120;

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connectPromise: Promise<RedisClient | null> | null = null;

async function getRedisClient(config: AppConfig): Promise<RedisClient | null> {
  if (!config.redisUrl) {
    return null;
  }
  if (client?.isOpen) {
    return client;
  }
  if (!connectPromise) {
    connectPromise = (async () => {
      try {
        const c = createClient({ url: config.redisUrl });
        await c.connect();
        client = c;
        return client;
      } catch {
        client = null;
        return null;
      } finally {
        connectPromise = null;
      }
    })();
  }
  return connectPromise;
}

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
    const parsed = JSON.parse(raw) as { tabVisible?: boolean; activeChatId?: string | null };
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
