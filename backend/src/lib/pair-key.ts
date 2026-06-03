/** Canonical key for a pair of user ids (order-independent). */
export function pairKeyForUserIds(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort((a, b) => a.localeCompare(b)).join(":");
}
