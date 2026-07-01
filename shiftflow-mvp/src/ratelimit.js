// Simple in-memory fixed-window rate limiter. Single-instance only; behind a
// load balancer this would move to a shared store (Redis). Good enough to blunt
// brute-force and abuse of the auth endpoints.
const buckets = new Map(); // key -> { count, resetAt }

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

// Periodically drop expired buckets so the map does not grow unbounded.
const timer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60_000);
timer.unref?.();
