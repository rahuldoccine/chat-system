/** In-process presence (single-node). With Redis adapter, still per-process; use Redis keys later for cross-node presence. */
const presence = new Map<string, { status: "online" | "away" | "busy"; lastSeenAt: string | null; updatedAt: number }>();

const TTL_MS = 120_000;

export function setPresence(userId: string, status: "online" | "away" | "busy", lastSeenAt: Date | null): void {
  presence.set(userId, {
    status,
    lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
    updatedAt: Date.now(),
  });
}

export function getPresence(userId: string) {
  const row = presence.get(userId);
  if (!row) return undefined;
  if (Date.now() - row.updatedAt > TTL_MS) {
    presence.delete(userId);
    return undefined;
  }
  return row;
}

export function clearPresence(userId: string): void {
  presence.delete(userId);
}

export function isUserPresentLocally(userId: string): boolean {
  return getPresence(userId) !== undefined;
}
