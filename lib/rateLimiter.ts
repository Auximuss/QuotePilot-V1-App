/**
 * Simple in-memory rate limiter.
 * Good enough for a single-instance deployment (Vercel functions share nothing
 * between instances, so limits are per-instance — conservative enough for launch).
 */

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

// Prune old entries every 5 minutes to prevent unbounded growth
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetInSeconds: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetInSeconds: Math.ceil(windowMs / 1000) };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetInSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetInSeconds: Math.ceil((entry.resetAt - now) / 1000) };
}
