type LimitRecord = {
  windowStart: number;
  count: number;
  lastRequestAt: number;
};

const records = new Map<string, LimitRecord>();

export type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  minIntervalMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
};

export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const existing = records.get(key);

  if (!existing) {
    records.set(key, {
      windowStart: now,
      count: 1,
      lastRequestAt: now
    });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (now - existing.windowStart > options.windowMs) {
    records.set(key, {
      windowStart: now,
      count: 1,
      lastRequestAt: now
    });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (now - existing.lastRequestAt < options.minIntervalMs) {
    return {
      allowed: false,
      retryAfterMs: options.minIntervalMs - (now - existing.lastRequestAt)
    };
  }

  if (existing.count >= options.maxRequests) {
    return {
      allowed: false,
      retryAfterMs: options.windowMs - (now - existing.windowStart)
    };
  }

  existing.count += 1;
  existing.lastRequestAt = now;
  records.set(key, existing);

  return { allowed: true, retryAfterMs: 0 };
}
