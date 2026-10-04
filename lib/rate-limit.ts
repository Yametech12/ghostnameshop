/**
 * Fixed-window rate limiter on Upstash Redis.
 *
 * Usage: call `rateLimit(route, ip, limit, windowSec)` at the top of a route
 * handler; when it returns `{ ok: false }`, reply 429 with the Retry-After
 * header. The increment is atomic (Lua) so concurrent bursts can't slip past
 * the window edge.
 *
 * If Redis is unreachable the limiter fails OPEN (with a warning) — a store
 * must not self-DoS on a Redis blip; brute-force depth comes from the admin
 * key itself and the attempt logging in the login route.
 */
import { Redis } from "@upstash/redis";

let client: Redis | null = null;

function redis(): Redis {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("Upstash Redis env missing (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)");
    client = new Redis({ url, token });
  }
  return client;
}

/** Atomic INCR + lazy EXPIRE; returns the current window count. */
const WINDOW_SCRIPT = `
local c = redis.call("INCR", KEYS[1])
if c == 1 then redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1])) end
return c
`;

export interface RateLimitResult {
  ok: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Seconds until the window resets (for Retry-After). */
  retryAfter: number;
}

export async function rateLimit(
  route: string,
  ip: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  const safeRoute = route.replace(/[^a-z0-9/_-]/gi, "").slice(0, 64) || "unknown";
  const safeIp = ip.replace(/[^a-zA-Z0-9.:]/g, "").slice(0, 64) || "unknown";
  const key = `gn:rl:${safeRoute}:${safeIp}`;
  try {
    const count = await redis().eval<number>(WINDOW_SCRIPT, [key], [String(windowSec)]);
    if (count > limit) {
      const ttl = await redis().ttl(key);
      return { ok: false, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSec };
    }
    return { ok: true, remaining: Math.max(0, limit - count), retryAfter: 0 };
  } catch (err) {
    console.warn("[rate-limit] redis unavailable, failing open", safeRoute, err);
    return { ok: true, remaining: limit, retryAfter: 0 };
  }
}

/** First entry of x-forwarded-for (set by the edge) — the client IP. */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || "unknown";
}
