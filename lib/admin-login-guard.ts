type AttemptBucket = {
  failedCount: number;
  blockedUntil: number;
  updatedAt: number;
};

type GuardStatus = {
  blocked: boolean;
  retryAfterSeconds: number;
};

const attemptMap = new Map<string, AttemptBucket>();
let lastSweepAt = 0;

function getMaxFailures() {
  const value = Number(process.env.ADMIN_LOGIN_MAX_FAILURES ?? 5);
  if (!Number.isFinite(value) || value < 1) {
    return 5;
  }
  return Math.floor(value);
}

function getBlockDurationMs() {
  const minutes = Number(process.env.ADMIN_LOGIN_BLOCK_MINUTES ?? 15);
  if (!Number.isFinite(minutes) || minutes < 1) {
    return 15 * 60_000;
  }
  return Math.floor(minutes * 60_000);
}

function sweepExpired(now: number) {
  if (now - lastSweepAt < 60_000) {
    return;
  }

  for (const [ip, bucket] of attemptMap.entries()) {
    const inactiveFor = now - bucket.updatedAt;
    const blockExpired = bucket.blockedUntil <= now;
    const stale = inactiveFor > 24 * 60_000;

    if (blockExpired && stale) {
      attemptMap.delete(ip);
    }
  }

  lastSweepAt = now;
}

export function getAdminLoginGuardStatus(ip: string): GuardStatus {
  const now = Date.now();
  sweepExpired(now);

  const bucket = attemptMap.get(ip);
  if (!bucket || bucket.blockedUntil <= now) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  return {
    blocked: true,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000))
  };
}

export function recordAdminLoginFailure(ip: string): GuardStatus {
  const now = Date.now();
  sweepExpired(now);

  const maxFailures = getMaxFailures();
  const blockDurationMs = getBlockDurationMs();
  const current = attemptMap.get(ip) ?? {
    failedCount: 0,
    blockedUntil: 0,
    updatedAt: now
  };

  if (current.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((current.blockedUntil - now) / 1000))
    };
  }

  current.failedCount += 1;
  current.updatedAt = now;

  // Block after more than N failures (for N=5, block starts at 6th failure).
  if (current.failedCount > maxFailures) {
    current.failedCount = 0;
    current.blockedUntil = now + blockDurationMs;
  }

  attemptMap.set(ip, current);

  if (current.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((current.blockedUntil - now) / 1000))
    };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

export function clearAdminLoginFailures(ip: string) {
  attemptMap.delete(ip);
}
