type Bucket = { tokens: number; updatedAt: number };

/** Simple per-user in-process token bucket (single node). */
export function createSocketLimiter(opts: { capacity: number; refillPerSec: number }) {
  const buckets = new Map<string, Bucket>();

  function refill(b: Bucket, now: number) {
    const dt = Math.max(0, now - b.updatedAt) / 1000;
    b.tokens = Math.min(opts.capacity, b.tokens + dt * opts.refillPerSec);
    b.updatedAt = now;
  }

  return {
    take: (key: string, cost = 1): boolean => {
      const now = Date.now();
      const b = buckets.get(key) ?? { tokens: opts.capacity, updatedAt: now };
      refill(b, now);
      if (b.tokens < cost) {
        buckets.set(key, b);
        return false;
      }
      b.tokens -= cost;
      buckets.set(key, b);
      return true;
    },
  };
}

