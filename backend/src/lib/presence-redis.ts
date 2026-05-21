import { createClient } from "redis";

import type { AppConfig } from "../config/index.js";

const PRESENCE_KEY_PREFIX = "presence:";
const PRESENCE_TTL_SEC = 120;

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

/** Mark user as having an active socket (cross-node hint for push suppression). */
export async function markUserPresentRedis(userId: string, config: AppConfig): Promise<void> {
  const c = await getRedisClient(config);
  if (!c) {
    return;
  }
  await c.set(`${PRESENCE_KEY_PREFIX}${userId}`, "1", { EX: PRESENCE_TTL_SEC });
}

export async function isUserPresentInRedis(userId: string, config: AppConfig): Promise<boolean> {
  const c = await getRedisClient(config);
  if (!c) {
    return false;
  }
  const v = await c.get(`${PRESENCE_KEY_PREFIX}${userId}`);
  return v === "1";
}
