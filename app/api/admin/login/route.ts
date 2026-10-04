import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  authConfigured,
  cookieValue,
  verifyAdminKey,
} from "@/lib/admin-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Admin dashboard not configured — set ADMIN_DASHBOARD_KEY in the environment." },
      { status: 503 }
    );
  }

  // Brute-force protection on BOTH login paths (JSON + HTML form).
  const ip = clientIp(request);
  const rl = await rateLimit("admin/login", ip, 10, 15 * 60);
  if (!rl.ok) {
    console.warn("[admin/login] rate limited", ip);
    return NextResponse.json(
      { error: "Too many login attempts — try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  let key: string | null = null;
  let isForm = false;

  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as { key?: string };
      key = body.key ?? null;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  } else {
    // HTML form post (urlencoded)
    isForm = true;
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form body" }, { status: 400 });
    }
    key = (form.get("key") as string | null) ?? null;
  }

  if (!verifyAdminKey(key)) {
    console.warn("[admin/login] failed attempt", ip);
    if (isForm) {
      return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
    }
    return NextResponse.json({ error: "Invalid admin key" }, { status: 401 });
  }

  console.log("[admin/login] success", new Date().toISOString(), ip);

  const res = isForm
    ? NextResponse.redirect(new URL("/admin", request.url), 303)
    : NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, cookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  return res;
}
