/**
 * Small in-memory fixed-window rate limiter for server API routes.
 * Pure and testable: no request/response objects, no user content stored —
 * only per-key counters (key is normally a client IP, never a message body).
 * Note: in-memory state is per server instance; it is a basic abuse guard,
 * not a distributed limiter.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds to wait before retrying, 0 when allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check: (key: string, nowMs?: number) => RateLimitResult;
  reset: () => void;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, { count: number; windowStart: number }>();
  return {
    check(key: string, nowMs: number = Date.now()): RateLimitResult {
      const entry = buckets.get(key);
      if (!entry || nowMs - entry.windowStart >= windowMs) {
        buckets.set(key, { count: 1, windowStart: nowMs });
        return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
      }
      if (entry.count < limit) {
        entry.count += 1;
        return { allowed: true, remaining: limit - entry.count, retryAfterSeconds: 0 };
      }
      const retryAfterSeconds = Math.ceil((entry.windowStart + windowMs - nowMs) / 1000);
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
    },
    reset() {
      buckets.clear();
    },
  };
}

/** Per-route shared limiters (per IP, per 60-second window). */
export const chatLimiter = createRateLimiter(30, 60_000);
export const visionLimiter = createRateLimiter(10, 60_000);
export const imageLimiter = createRateLimiter(10, 60_000);

/** Best-effort client key from headers; falls back to "anonymous". */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  return "anonymous";
}
