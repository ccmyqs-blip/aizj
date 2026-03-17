type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
  windowSeconds: number;
};

type CounterBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, CounterBucket>();
let lastSweepAt = 0;

function sweepExpired(now: number) {
  // Keep cleanup cheap by sweeping at most once every 30s.
  if (now - lastSweepAt < 30_000) {
    return;
  }

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  lastSweepAt = now;
}

export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs
    });

    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      limit,
      windowSeconds: Math.ceil(windowMs / 1000)
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      limit,
      windowSeconds: Math.ceil(windowMs / 1000)
    };
  }

  existing.count += 1;

  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    limit,
    windowSeconds: Math.ceil(windowMs / 1000)
  };
}
