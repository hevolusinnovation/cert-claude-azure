/**
 * Dead-simple in-memory, per-IP rate limiter.
 *
 * LIMITATION: state lives in this process's memory. It resets on redeploy and
 * is NOT shared across multiple instances/regions. It exists so that a student
 * who deploys their own public instance does not get their own API key drained
 * by a single client. For serious multi-instance traffic, swap this for a
 * durable store (e.g. Redis / Upstash) keyed the same way.
 */

const WINDOW_MS = 60_000;
const LIMIT = 10;

const hits = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry (only meaningful when !allowed). */
  retryAfter: number;
}

export function rateLimit(ip: string, now: number = Date.now()): RateLimitResult {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= LIMIT) {
    hits.set(ip, recent);
    const oldest = recent[0];
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    return { allowed: false, retryAfter };
  }

  recent.push(now);
  hits.set(ip, recent);
  return { allowed: true, retryAfter: 0 };
}
