/**
 * Admin dashboard auth — single shared key (ADMIN_DASHBOARD_KEY).
 *
 * The browser holds an httpOnly cookie whose value is sha256(key): the raw
 * key never travels after login, and the server can verify the cookie without
 * storing session state. For API routes, `Authorization: Bearer <raw key>`
 * is also accepted (handy for scripts/curl).
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "gn_admin";

/** sha256 of the configured key — safe to store in a cookie. */
function cookieToken(): string {
  return createHash("sha256").update(adminKey()).digest("hex");
}

function adminKey(): string {
  const key = process.env.ADMIN_DASHBOARD_KEY;
  if (!key || key.length < 8) {
    throw new Error("ADMIN_DASHBOARD_KEY missing or too short (min 8 chars)");
  }
  return key;
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

/** Verify a cookie token (sha256 of the configured key). */
export function verifyAdminCookie(token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    return safeEqual(token, cookieToken());
  } catch {
    return false;
  }
}

export function cookieValue(): string {
  return cookieToken();
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
    if (match && verifyAdminCookie(decodeURIComponent(match.slice(ADMIN_COOKIE.length + 1)))) {
      return true;
    }
  }
  return false;
}

export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 12; // 12 hours
