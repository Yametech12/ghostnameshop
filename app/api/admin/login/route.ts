import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  authConfigured,
  cookieValue,
  verifyAdminKey,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Admin dashboard not configured — set ADMIN_DASHBOARD_KEY in the environment." },
      { status: 503 }
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
    const form = await request.formData();
    key = (form.get("key") as string | null) ?? null;
  }

  if (!verifyAdminKey(key)) {
    if (isForm) {
      return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
    }
    // Small delay to slow brute-force attempts (JSON path only).
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "Invalid admin key" }, { status: 401 });
  }

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
