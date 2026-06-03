import { createClient } from "redis";

import type { AppConfig } from "../config/index.js";

export type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connectPromise: Promise<RedisClient | null> | null = null;

export async function getRedisClient(config: AppConfig): Promise<RedisClient | null> {
  if (!config.redisUrl) {
    return null;
  }
  if (client?.isOpen) {
    return client;
  }
  connectPromise ??= (async () => {
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
  return connectPromise;
}
