/**
 * Admin dashboard auth — single shared key (ADMIN_DASHBOARD_KEY).
 *
 * The browser holds an httpOnly cookie shaped `<expiresAtMs>.<hmac>`, where the
 * HMAC is keyed by ADMIN_DASHBOARD_KEY. The raw key never travels after login,
 * the server verifies the cookie without session storage, and every cookie
 * EXPIRES on its own. (The old cookie was a bare sha256(key): identical for every
 * login, never expiring server-side, so a leaked cookie stayed valid until the key
 * was rotated.) Rotating ADMIN_DASHBOARD_KEY still revokes every session at once.
 * For API routes, `Authorization: Bearer <raw key>` is also accepted.
 *
 * The key must be ≥ 32 chars — a weak key throws at boot rather than
 * silently running.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "gn_admin";

/** HMAC of an expiry timestamp, keyed by the admin key — safe to store in a cookie. */
function sign(expiresAt: string): string {
  return createHmac("sha256", adminKey()).update(`gn-admin-session:${expiresAt}`).digest("hex");
}

function adminKey(): string {
  const key = process.env.ADMIN_DASHBOARD_KEY;
  if (!key || key.length < 32) {
    throw new Error("ADMIN_DASHBOARD_KEY missing or too short (min 32 chars)");
  }
  return key;
}

// Fail fast at boot when a key IS configured but too weak. (When no key is
// configured at all, authConfigured() stays false and the login route 503s.)
if (process.env.ADMIN_DASHBOARD_KEY !== undefined) {
  adminKey();
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Verify a raw key (from login form or Bearer header). */
export function verifyAdminKey(candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  try {
    return safeEqual(candidate.trim(), adminKey());
  } catch {
    return false;
  }
}

/** Verify a session cookie: well-formed, not expired, signature matches. */
export function verifyAdminCookie(token: string | null | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const expiresAt = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d{10,15}$/.test(expiresAt) || Number(expiresAt) <= Date.now()) return false;
  try {
    return safeEqual(sig, sign(expiresAt));
  } catch {
    return false;
  }
}

/** Fresh session cookie value, valid for ADMIN_COOKIE_MAX_AGE seconds. */
export function cookieValue(): string {
  const expiresAt = String(Date.now() + ADMIN_COOKIE_MAX_AGE * 1000);
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function authConfigured(): boolean {
  try {
    adminKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract admin credentials from a Request: cookie first, then Bearer.
 * Returns true when the caller is authenticated as the admin.
 */
export function isAdminRequest(request: Request, cookieHeader: string | null): boolean {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && verifyAdminKey(bearer.slice(7))) return true;
  if (cookieHeader) {
    const match = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(ADMIN_COOKIE + "="));
    if (match) {
      let token: string;
      try {
        token = decodeURIComponent(match.slice(ADMIN_COOKIE.length + 1));
      } catch {
        return false; // malformed cookie encoding — unauthenticated, never throw
      }
      if (verifyAdminCookie(token)) return true;
    }
  }
  return false;
}

export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 12; // 12 hours
