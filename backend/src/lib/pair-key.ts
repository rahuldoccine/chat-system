/** Canonical key for a pair of user ids (order-independent). */
export function pairKeyForUserIds(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(":");
}
