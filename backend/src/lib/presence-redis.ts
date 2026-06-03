import type { AppConfig } from "../config/index.js";
import { getRedisClient } from "./redis-lazy-client.js";

const PRESENCE_KEY_PREFIX = "presence:";
const PRESENCE_TTL_SEC = 120;

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
