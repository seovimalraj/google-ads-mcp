interface BucketState {
  tokens: number;
  updatedAt: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

const buckets = new Map<string, BucketState>();
const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 60_000;

export function consumeRateLimit(key: string, weight = 1, limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW_MS): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: limit, updatedAt: now };
  const elapsed = now - bucket.updatedAt;
  const tokensToAdd = Math.floor((elapsed / windowMs) * limit);

  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(limit, bucket.tokens + tokensToAdd);
    bucket.updatedAt = now;
  }

  if (bucket.tokens < weight) {
    const reset = bucket.updatedAt + windowMs;
    buckets.set(key, bucket);
    return {
      success: false,
      limit,
      remaining: Math.max(0, bucket.tokens),
      reset,
    };
  }

  bucket.tokens -= weight;
  bucket.updatedAt = now;
  buckets.set(key, bucket);

  return {
    success: true,
    limit,
    remaining: bucket.tokens,
    reset: now + windowMs,
  };
}

export function clearRateLimit(key: string): void {
  buckets.delete(key);
}
